import { rpc } from '../supabase.js';
import { groupImageUrl } from '../images.js';
import { h, icon, groupAvatar, avatar, ago, categoryLabel, plural, toast, toastError, withBusy } from '../ui.js';
import { navigate } from '../router.js';

export async function joinPublicGroup(g) {
  const st = await rpc('join_group', { p_group: g.id });
  if (st === 'active') { toast('You joined ' + g.name + '. You have a brand-new anonymous name there.', 'success', 4500); navigate('/g/' + g.id); }
  else if (st === 'pending') { toast('Request sent. The group admins will review it.', 'success'); }
  return st;
}

export function groupCard(g) {
  const joinBtn = h('button', { class: 'btn primary sm' }, g.join_mode === 'approval' ? 'Request to join' : 'Join');
  const act = g.my_status === 'active' ? h('a', { class: 'btn sm', href: '#/g/' + g.id }, 'Open')
    : g.my_status === 'pending' ? h('span', { class: 'tag warn' }, 'Request pending')
    : g.my_status === 'banned' ? h('span', { class: 'tag danger' }, 'Unavailable') : joinBtn;
  joinBtn.onclick = () => withBusy(joinBtn, async () => { const st = await joinPublicGroup(g); if (st === 'pending') { joinBtn.replaceWith(h('span', { class: 'tag warn' }, 'Request pending')); } });
  return h('article', { class: 'gcard' },
    h('div', { class: 'row' }, groupAvatar(groupImageUrl(g.image_path), g.name, 46), h('div', { class: 'grow' }, h('h3', { class: 'truncate', style: { margin: 0 } }, g.name),
      h('div', { class: 'meta' }, h('span', null, categoryLabel(g.category)), h('span', null, plural(g.member_count, 'member'))))),
    h('p', { class: 'desc', style: { margin: 0 } }, g.description || 'No description yet.'),
    h('div', { class: 'row between' }, g.recent_messages != null ? h('span', { class: 'faint small' }, g.recent_messages ? `${g.recent_messages} messages this week` : 'Quiet this week') : h('span'), act));
}

export function myGroupRow(g) {
  const lm = g.last_message;
  return h('a', { class: 'item' + (g.unread ? ' unread' : ''), href: '#/g/' + g.id }, groupAvatar(groupImageUrl(g.image_path), g.name, 46),
    h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'title truncate' + (g.unread ? ' unread-title' : '') }, g.name, g.status === 'pending' ? h('span', { class: 'tag warn', style: { marginLeft: '8px' } }, 'Pending') : null, g.privacy === 'private' ? h('span', { style: { marginLeft: '6px', verticalAlign: 'middle', color: 'var(--faint)' } }, icon('lock', 13)) : null),
      h('div', { class: 'sub truncate' }, g.status === 'pending' ? 'Waiting for approval…' : lm ? `${lm.username}: ${lm.body}` : 'No messages yet'),
      h('div', { class: 'faint small' }, 'You are ', h('span', { class: 'mono' }, g.my_username))),
    h('div', { style: { textAlign: 'right' } }, lm ? h('div', { class: 'time' }, ago(lm.created_at)) : null, g.unread ? h('span', { class: 'badge' }, g.unread > 99 ? '99+' : g.unread) : (g.muted ? h('span', { class: 'faint' }, icon('mute', 14)) : null)));
}

export function conversationRow(c, active) {
  const lm = c.last_message;
  return h('a', { class: 'item' + (c.unread ? ' unread' : '') + (active ? ' active' : ''), href: '#/messages/' + c.id }, avatar(c.other_avatar, c.other_alias, 46),
    h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'title truncate' }, c.other_alias, c.muted ? h('span', { class: 'faint', style: { marginLeft: '6px' } }, icon('mute', 13)) : null),
      h('div', { class: 'sub truncate' }, lm ? (lm.mine ? 'You: ' : '') + lm.body : 'Say hello 👋')),
    h('div', { style: { textAlign: 'right' } }, h('div', { class: 'time' }, ago(c.last_message_at)), c.unread ? h('span', { class: 'badge' }, c.unread) : null));
}

export function discussionRow(d) {
  return h('a', { class: 'item', href: '#/g/' + d.group_id + '?m=' + d.message_id, style: { alignItems: 'flex-start' } }, avatar(d.avatar, d.username, 38),
    h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'small' }, h('b', { class: 'mono' }, d.username), h('span', { class: 'faint' }, ' in '), h('b', null, d.group_name), h('span', { class: 'faint' }, ' · ' + ago(d.created_at))),
      h('div', { class: 'sub', style: { color: 'var(--text)', opacity: .88, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, d.body),
      h('div', { class: 'faint small' }, categoryLabel(d.category))));
}
