// Group conversation: real-time chat where every sender shows their group-specific anonymous name.
import { rpc } from '../supabase.js';
import { store, refreshCounts } from '../store.js';
import { watchGroup } from '../realtime.js';
import { groupImageUrl } from '../images.js';
import { createChat } from '../views/chat.js';
import { openReport } from '../views/report.js';
import { h, icon, groupAvatar, actionSheet, confirmDialog, toast, toastError, setTitle, withBusy, empty, plural, categoryLabel } from '../ui.js';
import { navigate } from '../router.js';
import { joinPublicGroup } from '../views/cards.js';

export default async function groupChat(ctx) {
  const gid = ctx.params.id;
  document.body.classList.add('wide-page');
  let g;
  try { g = await rpc('get_group_info', { p_group: gid }); }
  catch (e) { return { el: empty('lock', 'Group not available', 'This group doesn’t exist or you don’t have access to it.', h('a', { class: 'btn primary', href: '#/groups' }, 'My groups')) }; }
  setTitle(g.name);

  // ── not an active member: show the right gate ──────────────
  if (g.my_status !== 'active') return { el: gate(g) };

  const staff = ['admin', 'moderator'].includes(g.my_role);
  const restricted = store.account?.status === 'restricted';
  const blockedByPolicy = g.posting_policy === 'staff' && !staff;
  const canPost = !restricted && !blockedByPolicy;
  const lockedText = restricted ? 'Your account is restricted, so you can read but not post.' : 'Only admins and moderators can post in this group.';

  let chat;
  const head = h('div', { class: 'chat-head' },
    h('a', { class: 'iconbtn', href: '#/groups', 'aria-label': 'Back to groups' }, icon('back', 22)),
    h('a', { class: 'who', href: '#/g/' + gid + '/info', 'aria-label': 'Group info' }, groupAvatar(groupImageUrl(g.image_path), g.name, 38),
      h('div', { style: { minWidth: 0 } }, h('div', { class: 'name truncate' }, g.name, g.privacy === 'private' ? h('span', { style: { marginLeft: '6px', color: 'var(--faint)' } }, icon('lock', 13)) : null),
        h('div', { class: 'sub truncate' }, plural(g.member_count, 'member') + ' · you are ', h('span', { class: 'mono' }, g.my_identity?.username || '')))),
    h('button', { class: 'iconbtn', 'aria-label': 'Search messages', onclick: () => chat?.openSearch() }, icon('search', 21)),
    h('button', { class: 'iconbtn', 'aria-label': 'Group menu', onclick: menu }, icon('more', 21)));

  function menu() {
    actionSheet([
      { label: 'Group info & members', icon: 'users', onClick: () => navigate('/g/' + gid + '/info') },
      { label: g.muted ? 'Unmute notifications' : 'Mute notifications', icon: 'mute', onClick: async () => {
          try { await rpc('mute_group', { p_group: gid, p_muted: !g.muted }); g.muted = !g.muted; toast(g.muted ? 'Group muted' : 'Group unmuted', 'success', 1800); } catch (e) { toastError(e); } } },
      { label: 'Report group', icon: 'flag', danger: true, onClick: () => openReport({ type: 'group', group: gid, label: 'Group: ' + g.name }) },
    ]);
  }

  const adapter = {
    fetch: ({ before, limit = 50, ids, search } = {}) => rpc('get_group_messages', { p_group: gid, p_before: before || null, p_limit: limit, p_ids: ids || null, p_search: search || null }),
    markRead: () => rpc('mark_group_read', { p_group: gid }).then(() => refreshCounts()).catch(() => {}),
    pins: () => rpc('get_pinned_messages', { p_group: gid }),
    send: ({ body, image, reply, kind }) => rpc('send_group_message', { p_group: gid, p_body: body, p_image: image, p_reply: reply, p_kind: kind }),
    edit: (id, body) => rpc('edit_group_message', { p_message: id, p_body: body }),
    del: (id) => rpc('delete_group_message', { p_message: id }),
    pin: (id, pinned) => rpc('pin_group_message', { p_message: id, p_pinned: pinned }),
    react: (id, emoji) => rpc('react_group_message', { p_message: id, p_emoji: emoji }),
    vote: (pollId, optionId) => rpc('vote_poll', { p_poll: pollId, p_option: optionId }),
    createPoll: ({ question, options, multiple, hours }) => rpc('create_poll', { p_group: gid, p_question: question, p_options: options, p_multiple: multiple, p_hours: hours }),
    watch: (cbs) => watchGroup(gid, cbs),
  };

  chat = createChat({
    kind: 'group', id: gid, adapter, header: head, canPost, lockedText, focusId: ctx.query.m || null,
    caps: { staff, poll: canPost, announce: staff && canPost },
    onProfile: (m) => navigate(`/p/${gid}/${m.identity_id}`),
    onReport: (m) => openReport({ type: m.image_path && !m.body ? 'image' : 'group_message', group: gid, message: m.id, label: `Message from ${m.username}` }),
    onBlock: async (m) => {
      if (!await confirmDialog({ title: `Block ${m.username}?`, message: 'You won’t see their messages in this group any more, and they can’t start a private chat with you. You can unblock anytime in Settings → Privacy.', confirmText: 'Block', danger: true })) return;
      try { await rpc('block_identity', { p_context: 'group', p_scope: gid, p_identity: m.identity_id }); toast('Blocked ' + m.username, 'success'); chat.reload(); } catch (e) { toastError(e); }
    },
  });
  return { el: chat.el, destroy: () => chat.destroy() };
}

// Gate for people who aren't (yet) in the group.
function gate(g) {
  const card = (...kids) => h('div', { class: 'card', style: { maxWidth: '520px', margin: '30px auto', textAlign: 'center' } },
    h('div', { style: { display: 'grid', placeItems: 'center', marginBottom: '12px' } }, groupAvatar(groupImageUrl(g.image_path), g.name, 76)), h('h1', null, g.name), ...kids);
  if (g.my_status === 'banned') return card(h('p', { class: 'muted' }, 'You can’t access this group.'), h('a', { class: 'btn', href: '#/explore' }, 'Explore other groups'));
  if (g.my_status === 'pending') return card(h('p', { class: 'muted' }, 'Your request is waiting for an admin to approve it. We’ll notify you.'), h('span', { class: 'tag warn' }, 'Request pending'),
    h('div', { style: { marginTop: '16px' } }, h('button', { class: 'btn', onclick: async (e) => withBusy(e.currentTarget, async () => { await rpc('leave_group', { p_group: g.id }); toast('Request cancelled', 'success'); navigate('/explore'); }) }, 'Cancel request')));
  const btn = h('button', { class: 'btn primary block' }, g.join_mode === 'approval' ? 'Request to join' : 'Join group');
  btn.onclick = () => withBusy(btn, async () => { const st = await joinPublicGroup({ id: g.id, name: g.name }); if (st === 'pending') navigate('/g/' + g.id, { replace: true }); });
  return card(h('p', { class: 'muted' }, g.description || 'No description yet.'),
    h('div', { class: 'meta', style: { justifyContent: 'center', marginBottom: '16px' } }, h('span', null, categoryLabel(g.category)), h('span', null, plural(g.member_count, 'member'))),
    g.rules ? h('div', { class: 'alert', style: { textAlign: 'left', marginBottom: '16px', whiteSpace: 'pre-wrap' } }, h('b', null, 'Group rules'), '\n', g.rules) : null, btn,
    h('p', { class: 'hint', style: { marginTop: '12px' } }, 'You’ll get a random anonymous name that’s unique to this group.'));
}
