// In-app notification centre (live: new rows arrive through Realtime).
import { rpc, listNotifications, deleteNotification } from '../supabase.js';
import { subscribe, refreshCounts } from '../store.js';
import { h, icon, empty, errorState, skeletons, setTitle, ago, toastError, withBusy, toast } from '../ui.js';
import { navigate } from '../router.js';

const ICON = { group_message: 'chat', reply: 'reply', reaction: 'smile', invite: 'mail', membership: 'check', join_request: 'users', dm_request: 'inbox', dm_accept: 'chat',
  dm_message: 'chat', announcement: 'megaphone', moderation: 'shield', report_update: 'flag' };

export default async function notifications() {
  setTitle('Notifications');
  const box = h('div', { class: 'list' }, skeletons(5, 64));
  const markAll = h('button', { class: 'btn sm' }, icon('check', 16), 'Mark all read');
  let dead = false, items = [];

  async function open(n) {
    try { if (!n.read) { await rpc('mark_notifications_read', { p_ids: [n.id] }); n.read = true; refreshCounts(); } } catch { /* non-fatal */ }
    if (/^#\//.test(n.link || '')) navigate(n.link.replace(/^#/, ''));
    else paint();
  }
  function paint() {
    markAll.disabled = !items.some((n) => !n.read);
    box.replaceChildren(...(items.length ? items.map((n) => h('div', { class: 'item' + (n.read ? '' : ' unread'), style: { alignItems: 'flex-start' } },
      h('button', { class: 'item', style: { flex: 1, padding: 0, background: 'none', alignItems: 'flex-start', minWidth: 0 }, onclick: () => open(n), 'aria-label': `${n.title}. ${n.body || ''}` },
        h('span', { class: 'ico', style: { display: 'grid', placeItems: 'center', width: '38px', height: '38px', borderRadius: '50%', background: 'var(--surface-3)', color: 'var(--accent)', flex: 'none' } }, icon(ICON[n.type] || 'bell', 18)),
        h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'title' }, n.title), n.body ? h('div', { class: 'sub' }, n.body) : null, h('div', { class: 'time' }, ago(n.created_at)))),
      h('button', { class: 'iconbtn', 'aria-label': 'Dismiss notification', onclick: async () => { try { await deleteNotification(n.id); items = items.filter((x) => x.id !== n.id); refreshCounts(); paint(); } catch (e) { toastError(e); } } }, icon('x', 16))))
      : [empty('bell', 'You’re all caught up', 'Replies, invitations, chat requests and updates will show up here.')]));
  }
  async function load() {
    try { items = await listNotifications(80); if (!dead) paint(); } catch (e) { if (!dead) box.replaceChildren(errorState(e, load)); }
  }
  markAll.onclick = () => withBusy(markAll, async () => { await rpc('mark_notifications_read', { p_ids: null }); items.forEach((n) => { n.read = true; }); refreshCounts(); paint(); toast('All caught up', 'success', 1500); });
  const unsub = subscribe((evt) => { if (evt === 'notification') load(); });
  load();
  return { el: h('div', { style: { maxWidth: '720px' } },
    h('div', { class: 'page-head' }, h('h1', null, 'Notifications'), h('div', { class: 'row' }, markAll, h('a', { class: 'btn sm', href: '#/settings/notifications' }, icon('settings', 16), 'Settings'))),
    h('div', { class: 'card', style: { padding: '8px' } }, box)),
    destroy: () => { dead = true; unsub(); } };
}
