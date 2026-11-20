// Anonymous one-to-one messaging: conversation list, DM requests, and the private chat itself.
// Every conversation has its own random names for both people; requests are required first.
import { rpc } from '../supabase.js';
import { store, subscribe, refreshCounts } from '../store.js';
import { watchConversation } from '../realtime.js';
import { createChat } from '../views/chat.js';
import { conversationRow } from '../views/cards.js';
import { openReport } from '../views/report.js';
import { h, icon, avatar, actionSheet, confirmDialog, toast, toastError, modal, setTitle, withBusy, empty, errorState, skeletons, ago } from '../ui.js';
import { navigate, refresh } from '../router.js';
import { isE2E, deriveConvKey, encryptText, decryptText, exportKeyB64, safetyCode } from '../e2ee.js';
import { initKeys, conversationKey, startFreshChat, S as keyS } from '../keys.js';
import { openBackupSetup, openRestore } from '../views/keyui.js';
import { micSupported, startRecording, uploadVoice, loadVoice } from '../voice.js';

// A one-time reminder to back up the chat keys (so a lost phone doesn't mean lost messages).
function backupNudge() {
  let dismissed = false; try { dismissed = localStorage.getItem('unsaid.bkdismiss') === '1'; } catch { /* private mode */ }
  if (dismissed || keyS.status !== 'ready' || keyS.hasBackup) return null;
  const box = h('div', { class: 'keynudge' }, h('div', { class: 'grow' }, h('b', null, '🔑 Back up your private chats'), h('div', { class: 'hint' }, 'Private chats are locked with keys that only live on this device. Back them up to keep your messages if you change phone.')),
    h('div', { class: 'row', style: { gap: '6px' } },
      h('button', { class: 'btn sm primary', onclick: () => openBackupSetup(() => box.remove()) }, 'Back up'),
      h('button', { class: 'iconbtn', 'aria-label': 'Dismiss', onclick: () => { try { localStorage.setItem('unsaid.bkdismiss', '1'); } catch { /* ignore */ } box.remove(); } }, icon('x', 16))));
  return box;
}

// Two-pane frame shared by all three routes.
function frame({ activeId = null, open = false, right }) {
  document.body.classList.add('wide-page');
  const list = h('div', { class: 'list', style: { padding: '8px' } }, skeletons(4, 64));
  const reqBadge = h('span', { class: 'badge hidden', style: { marginLeft: '6px' } });
  const head = h('div', { class: 'head' }, h('h1', { style: { margin: 0, fontSize: '1.25rem' } }, 'Messages'),
    h('a', { class: 'btn sm', href: '#/messages/requests' }, icon('inbox', 16), 'Requests', reqBadge));
  const nudge = backupNudge();
  const el = h('div', { class: 'two-pane messages' + (open ? ' open' : '') },
    h('aside', { class: 'pane-list', 'aria-label': 'Conversations' }, head, nudge, list),
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

// ── private conversation (end-to-end encrypted) ───────────────
const UNREADABLE = '🔒 Can’t be opened on this device';
export async function conversation(ctx) {
  const id = ctx.params.id;
  let c;
  try { c = await rpc('get_conversation', { p_conv: id }); } catch { c = null; }
  if (!c) return { el: h('div', { style: { padding: '30px 16px' } }, empty('lock', 'Conversation not found', 'It may have been deleted.', h('a', { class: 'btn primary', href: '#/messages' }, 'Back to messages'))) };
  setTitle(c.other_alias);
  const uid = store.session?.user?.id;
  try { navigator.storage?.persist?.(); } catch { /* ask the browser not to wipe our keys */ }

  // ── keys: state is 'ready' | 'waiting' (other person has no key yet) | 'lost' (keys not on this device) | 'nostorage'
  let state = 'ready', aes = null, mine = null;
  try {
    await initKeys(uid);
    mine = (await conversationKey(uid, id, c)).pair;
    if (!mine) state = keyS.status === 'unavailable' ? 'nostorage' : 'lost';
    else if (!c.other_key) state = 'waiting';
    else aes = await deriveConvKey(mine.priv, c.other_key, id);
  } catch (e) { state = 'nostorage'; }

  const restricted = store.account?.status === 'restricted';
  const canPost = !c.closed && !restricted && state === 'ready';
  const lockedText = c.closed ? 'This conversation has been closed. You can still read it.'
    : restricted ? 'Your account is restricted, so you can read but not send messages.'
    : state === 'waiting' ? '🔒 Almost ready. This chat is end-to-end encrypted, and the other person’s phone hasn’t made its key yet. You can send as soon as they open UNSAID once.'
    : state === 'lost' ? (keyS.status === 'need-restore' && keyS.hasBackup ? '🔒 This device doesn’t have your private chat keys yet. Restore them with your recovery code or passphrase to open your older messages.' : '🔒 This chat’s keys aren’t on this device (a different browser, or its data was cleared). Older messages can’t be opened here.')
    : '🔒 Private chats need your browser to store a secret key, and it can’t here. Turn off private/incognito mode and try again.';
  const lockedAction = (state === 'lost' && !c.closed && !restricted)
    ? [...(keyS.hasBackup ? [{ label: 'Restore my keys', onClick: () => openRestore(() => refresh()) }] : []), { label: 'Start fresh on this device', onClick: startFresh }] : null;
  let chat;

  async function startFresh() {
    if (!await confirmDialog({ title: 'Start fresh on this device?', message: 'You’ll be able to send and receive new messages here. Older messages in this chat can’t be opened by either of you afterwards. The other person is told your security code changed.', confirmText: 'Start fresh', danger: true })) return;
    try {
      await startFreshChat(uid, id);
      refresh();
    } catch (e) { toastError(e); }
  }
  async function showCode() {
    if (!c.my_key || !c.other_key) { toast('Available once both of you have a key for this chat.', 'info'); return; }
    const code = await safetyCode(c.my_key, c.other_key);
    const m = modal({ title: 'Security code', body: h('div', null,
      h('p', { class: 'mono', style: { fontSize: '1.15rem', lineHeight: 1.6, textAlign: 'center', letterSpacing: '.04em' } }, code),
      h('p', { class: 'muted small' }, 'If this code is the same on both of your screens, nobody has tampered with the encryption of this chat. You can compare it in person or in another app. It changes if either of you starts fresh on a new device.')),
      actions: [h('button', { class: 'btn primary', onclick: () => m.close() }, 'Done')] });
  }

  const head = h('div', { class: 'chat-head' },
    h('a', { class: 'iconbtn', href: '#/messages', 'aria-label': 'Back to messages' }, icon('back', 22)),
    h('div', { class: 'who', style: { cursor: 'default' } }, avatar(c.other_avatar, c.other_alias, 38),
      h('div', { style: { minWidth: 0 } }, h('div', { class: 'name truncate mono' }, c.other_alias), h('div', { class: 'sub truncate' }, '🔒 Encrypted · you are ', h('span', { class: 'mono' }, c.my_alias)))),
    h('button', { class: 'iconbtn', 'aria-label': 'Conversation menu', onclick: menu }, icon('more', 21)));

  function menu() {
    actionSheet([
      { label: 'Security code', icon: 'shield', onClick: showCode },
      ...(voice && micSupported() ? [c.voice_state === 'on' ? { label: 'Turn off voice notes', icon: 'mute', onClick: () => voice.disable() }
        : c.voice_state === 'requested' && c.voice_by_me ? { label: 'Cancel voice note request', icon: 'x', onClick: () => voice.disable() }
        : c.voice_state === 'off' ? { label: 'Ask to use voice notes', icon: 'chat', onClick: () => voice.request() } : null].filter(Boolean) : []),
      { label: c.muted ? 'Unmute conversation' : 'Mute conversation', icon: 'mute', onClick: async () => { try { await rpc('mute_conversation', { p_conv: id, p_muted: !c.muted }); c.muted = !c.muted; toast(c.muted ? 'Muted' : 'Unmuted', 'success', 1600); } catch (e) { toastError(e); } } },
      { label: 'Report conversation', icon: 'flag', danger: true, onClick: () => report({ type: 'conversation' }) },
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
  async function report(t) {
    let evidenceKey = null;
    try { if (aes) evidenceKey = await exportKeyB64(aes); } catch { /* report without a key */ }
    openReport({ ...t, conversation: id, evidenceKey, label: 'Private conversation' });
  }

  // decrypt in place (the server only ever holds ciphertext)
  async function open(rows) {
    for (const m of rows) {
      if (isE2E(m.body)) m.body = (aes && await decryptText(aes, id, m.alias_id, m.body)) ?? UNREADABLE;
      if (m.reply && isE2E(m.reply.body)) m.reply.body = (aes && m.reply.alias_id && await decryptText(aes, id, m.reply.alias_id, m.reply.body)) ?? UNREADABLE;
    }
    return rows;
  }
  // ── voice notes (permission based, end-to-end encrypted) ──
  const voice = (aes && state === 'ready' && !c.closed) ? {
    state: () => c.voice_state, byMe: () => !!c.voice_by_me, other: c.other_alias, supported: micSupported(),
    request: async () => {
      if (!await confirmDialog({ title: `Ask ${c.other_alias} to allow voice notes?`, message: 'They’ll get a request and must accept before anyone can send a voice note. Voice notes are encrypted, but a voice can reveal who you are, so only use them with people you trust. Either of you can turn them off at any time.', confirmText: 'Send request' })) return;
      try { await rpc('request_dm_voice', { p_conv: id }); toast('Request sent. You can send voice notes once they accept.', 'success', 4000); refresh(); } catch (e) { toastError(e); }
    },
    respond: async (ok) => { try { await rpc('respond_dm_voice', { p_conv: id, p_accept: ok }); refresh(); } catch (e) { toastError(e); } },
    disable: async () => { try { await rpc('disable_dm_voice', { p_conv: id }); toast('Voice notes are off.', 'success', 2000); refresh(); } catch (e) { toastError(e); } },
    record: startRecording,
    send: async (rec, reply) => { const path = await uploadVoice({ conv: id, aes, aliasId: c.my_alias_id, rec }); return rpc('send_dm_voice', { p_conv: id, p_path: path, p_reply: reply || null }); },
    load: (m) => loadVoice(m.voice_path, aes, id, m.alias_id),
  } : null;
  const adapter = {
    fetch: async ({ before, limit = 50, ids } = {}) => open(await rpc('get_dm_messages', { p_conv: id, p_before: before || null, p_limit: limit, p_ids: ids || null })),
    markRead: () => rpc('mark_dm_read', { p_conv: id }).then(() => refreshCounts()).catch(() => {}),
    pins: async () => [],
    send: async ({ body, reply }) => rpc('send_dm', { p_conv: id, p_body: await encryptText(aes, id, c.my_alias_id, body), p_image: null, p_reply: reply }),
    del: (mid) => rpc('delete_dm_message', { p_message: mid }),
    react: (mid, emoji) => rpc('react_dm_message', { p_message: mid, p_emoji: emoji }),
    watch: (cbs) => watchConversation(id, cbs),
  };
  chat = createChat({
    kind: 'dm', id, adapter, header: head, canPost, lockedText, lockedAction, voice, caps: {}, noImages: true, maxLen: 2000, placeholder: '🔒 Write an encrypted message…',
    onReport: (m) => report({ type: 'dm_message', message: m.id }),
    onBlock: (m) => block(m.alias_id, m.username),
  });
  // the other person may open the chat, or start fresh on a new device: pick up the new key
  const keyWatch = setInterval(async () => {
    if (document.hidden) return;
    try { const n = await rpc('get_conversation', { p_conv: id }); if (n && (n.other_key !== c.other_key || n.my_key !== c.my_key || n.voice_state !== c.voice_state) && !chat.isRecording?.()) { clearInterval(keyWatch); refresh(); } } catch { /* offline */ }
  }, 15000);
  const f = frame({ activeId: id, open: true, right: chat.el });
  return { el: f.el, destroy: () => { clearInterval(keyWatch); chat.destroy(); f.destroy(); } };
}
