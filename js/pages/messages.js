// Anonymous one-to-one messaging: conversation list, DM requests, and the private chat itself.
// Every conversation has its own random names for both people; requests are required first.
import { rpc } from '../supabase.js';
import { store, subscribe, refreshCounts } from '../store.js';
import { watchConversation } from '../realtime.js';
import { createChat } from '../views/chat.js';
import { conversationRow } from '../views/cards.js';
import { openReport } from '../views/report.js';
import { h, icon, avatar, actionSheet, confirmDialog, toast, toastError, setTitle, withBusy, empty, errorState, skeletons, ago } from '../ui.js';
import { navigate } from '../router.js';

// Two-pane frame shared by all three routes.
function frame({ activeId = null, open = false, right }) {
  document.body.classList.add('wide-page');
  const list = h('div', { class: 'list', style: { padding: '8px' } }, skeletons(4, 64));
  const reqBadge = h('span', { class: 'badge hidden', style: { marginLeft: '6px' } });
  const head = h('div', { class: 'head' }, h('h1', { style: { margin: 0, fontSize: '1.25rem' } }, 'Messages'),
    h('a', { class: 'btn sm', href: '#/messages/requests' }, icon('inbox', 16), 'Requests', reqBadge));
  const el = h('div', { class: 'two-pane messages' + (open ? ' open' : '') },
    h('aside', { class: 'pane-list', 'aria-label': 'Conversations' }, head, list),
    h('section', { class: 'pane-chat' }, right || h('div', { class: 'pane-ph' }, h('div', null, h('div', { class: 'ico', style: { display: 'inline-grid', marginBottom: '8px' } }, icon('ghost', 40)),
      h('h3', null, 'Your private chats'), h('p', { class: 'muted' }, 'Choose a conversation, or start one from someone’s profile in a shared group.')))));
  let dead = false;
  async function loadList() {
    try {
      const cs = await rpc('my_conversations');
      if (dead) return;
      list.replaceChildren(...(cs.length ? cs.map((c) => conversationRow(c, c.id === activeId)) : [empty('chat', 'No private chats yet', 'Open someone’s profile in a group and send a chat request. They choose whether to accept.')]));
    } catch (e) { if (!dead) list.replaceChildren(errorState(e, loadList)); }
  }
  const paintBadge = () => { const n = store.counts.dm_requests || 0; reqBadge.textContent = n; reqBadge.classList.toggle('hidden', !n); };
  paintBadge(); loadList();
  const unsub = subscribe((evt, p) => { if (evt === 'counts') paintBadge(); if (evt === 'notification' && /^dm_/.test(p?.type || '')) loadList(); });
  const timer = setInterval(() => { if (!document.hidden) loadList(); }, 20000);
  return { el, loadList, destroy: () => { dead = true; unsub(); clearInterval(timer); } };
}

export async function list() {
  setTitle('Messages');
  const f = frame({});
  return { el: f.el, destroy: f.destroy };
}

// ── DM requests ───────────────────────────────────────────────
export async function requests() {
  setTitle('Chat requests');
  const inBox = h('div', { class: 'stack', style: { gap: '8px' } }, skeletons(2, 62));
  const outBox = h('div', { class: 'stack', style: { gap: '8px' } });
  const right = h('div', { style: { padding: '16px', maxWidth: '640px' } },
    h('div', { class: 'page-head' }, h('div', { class: 'row' }, h('a', { class: 'iconbtn', href: '#/messages', 'aria-label': 'Back to messages' }, icon('back', 22)), h('h1', null, 'Chat requests'))),
    h('p', { class: 'muted small' }, 'Nobody can message you without your approval. Accepting creates a private chat where you both get brand-new random names.'),
    h('section', { class: 'section' }, h('h2', null, 'Waiting for you'), inBox),
    h('section', { class: 'section' }, h('h2', null, 'Sent by you'), outBox));
  const f = frame({ open: true, right });

  async function load() {
    try {
      const r = await rpc('list_dm_requests');
      inBox.replaceChildren(...(r.incoming.length ? r.incoming.map((q) => h('div', { class: 'card', style: { padding: '12px 14px' } },
        h('div', { class: 'row' }, avatar(q.avatar, q.username, 42), h('div', { class: 'grow' }, h('div', null, h('span', { class: 'mono', style: { fontWeight: 650 } }, q.username), h('span', { class: 'faint small' }, ' · ' + ago(q.created_at))),
          h('div', { class: 'hint' }, 'from the group “' + (q.group_name || 'a group') + '”'))),
        h('div', { class: 'row', style: { marginTop: '10px', justifyContent: 'flex-end' } },
          h('button', { class: 'btn', onclick: (e) => withBusy(e.currentTarget, async () => { await rpc('respond_dm_request', { p_request: q.id, p_accept: false }); toast('Request declined', 'success', 1600); refreshCounts(); load(); }) }, 'Decline'),
          h('button', { class: 'btn primary', onclick: (e) => withBusy(e.currentTarget, async () => { const conv = await rpc('respond_dm_request', { p_request: q.id, p_accept: true }); refreshCounts(); f.loadList(); navigate('/messages/' + conv); }) }, 'Accept')))) : [empty('inbox', 'No pending requests', 'When someone asks to chat privately, it shows up here.')]));
      outBox.replaceChildren(...(r.outgoing.length ? r.outgoing.map((q) => h('div', { class: 'idrow' }, h('div', null, h('span', { class: 'mono' }, q.username), h('div', { class: 'hint' }, 'in “' + (q.group_name || 'a group') + '” · ' + ago(q.created_at))),
        q.status === 'pending' ? h('button', { class: 'btn sm', onclick: (e) => withBusy(e.currentTarget, async () => { await rpc('cancel_dm_request', { p_request: q.id }); load(); }) }, 'Cancel')
          : h('span', { class: 'tag ' + (q.status === 'accepted' ? 'ok' : '') }, q.status === 'accepted' ? 'Accepted' : 'Not accepted'))) : [h('p', { class: 'muted small', style: { margin: 0 } }, 'You haven’t sent any requests recently.')]));
    } catch (e) { inBox.replaceChildren(errorState(e, load)); }
  }
  load();
  return { el: f.el, destroy: f.destroy };
}

// ── private conversation ──────────────────────────────────────
export async function conversation(ctx) {
  const id = ctx.params.id;
  let c;
  try { c = await rpc('get_conversation', { p_conv: id }); } catch { c = null; }
  if (!c) return { el: h('div', { style: { padding: '30px 16px' } }, empty('lock', 'Conversation not found', 'It may have been deleted.', h('a', { class: 'btn primary', href: '#/messages' }, 'Back to messages'))) };
  setTitle(c.other_alias);
  const restricted = store.account?.status === 'restricted';
  const canPost = !c.closed && !restricted;
  const lockedText = c.closed ? 'This conversation has been closed. You can still read it.' : 'Your account is restricted, so you can read but not send messages.';
  let chat;

  const head = h('div', { class: 'chat-head' },
    h('a', { class: 'iconbtn', href: '#/messages', 'aria-label': 'Back to messages' }, icon('back', 22)),
    h('div', { class: 'who', style: { cursor: 'default' } }, avatar(c.other_avatar, c.other_alias, 38),
      h('div', { style: { minWidth: 0 } }, h('div', { class: 'name truncate mono' }, c.other_alias), h('div', { class: 'sub truncate' }, 'Private chat · you are ', h('span', { class: 'mono' }, c.my_alias)))),
    h('button', { class: 'iconbtn', 'aria-label': 'Conversation menu', onclick: menu }, icon('more', 21)));

  function menu() {
    actionSheet([
      { label: c.muted ? 'Unmute conversation' : 'Mute conversation', icon: 'mute', onClick: async () => { try { await rpc('mute_conversation', { p_conv: id, p_muted: !c.muted }); c.muted = !c.muted; toast(c.muted ? 'Muted' : 'Unmuted', 'success', 1500); } catch (e) { toastError(e); } } },
      { label: 'Report conversation', icon: 'flag', danger: true, onClick: () => openReport({ type: 'conversation', conversation: id, label: 'Private conversation' }) },
      { label: 'Block ' + c.other_alias, icon: 'ban', danger: true, onClick: () => block(c.other_alias_id, c.other_alias) },
      { label: 'Delete conversation', icon: 'trash', danger: true, onClick: async () => {
          if (!await confirmDialog({ title: 'Delete this conversation?', message: 'It disappears for you. The other person keeps their copy until they delete it too.', confirmText: 'Delete', danger: true })) return;
          try { await rpc('delete_conversation', { p_conv: id }); toast('Conversation deleted', 'success'); navigate('/messages'); } catch (e) { toastError(e); } } },
    ]);
  }
  async function block(aliasId, name) {
    if (!await confirmDialog({ title: `Block ${name}?`, message: 'This closes the conversation and stops them contacting you. You can unblock in Settings → Privacy.', confirmText: 'Block', danger: true })) return;
    try { await rpc('block_identity', { p_context: 'dm', p_scope: id, p_identity: aliasId }); toast('Blocked', 'success'); navigate('/messages'); } catch (e) { toastError(e); }
  }

  const adapter = {
    fetch: ({ before, limit = 50, ids } = {}) => rpc('get_dm_messages', { p_conv: id, p_before: before || null, p_limit: limit, p_ids: ids || null }),
    markRead: () => rpc('mark_dm_read', { p_conv: id }).then(() => refreshCounts()).catch(() => {}),
    pins: async () => [],
    send: ({ body, image, reply }) => rpc('send_dm', { p_conv: id, p_body: body, p_image: image, p_reply: reply }),
    del: (mid) => rpc('delete_dm_message', { p_message: mid }),
    react: (mid, emoji) => rpc('react_dm_message', { p_message: mid, p_emoji: emoji }),
    watch: (cbs) => watchConversation(id, cbs),
  };
  chat = createChat({
    kind: 'dm', id, adapter, header: head, canPost, lockedText, caps: {},
    onReport: (m) => openReport({ type: m.image_path && !m.body ? 'image' : 'dm_message', conversation: id, message: m.id, label: 'Message in a private chat' }),
    onBlock: (m) => block(m.alias_id, m.username),
  });
  const f = frame({ activeId: id, open: true, right: chat.el });
  return { el: f.el, destroy: () => { chat.destroy(); f.destroy(); } };
}
