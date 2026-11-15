import { rpc, listNotifications } from '../supabase.js';
import { store } from '../store.js';
import { h, icon, empty, errorState, skeletons, setTitle, modal, ago } from '../ui.js';
import { myGroupRow, conversationRow, discussionRow, groupCard } from '../views/cards.js';

export default async function home() {
  setTitle('Home');
  const root = h('div');
  const section = (title, body, more) => h('section', { class: 'section' }, h('h2', null, title, more), body);
  const slots = { groups: h('div', { class: 'list' }, skeletons(3)), convs: h('div', { class: 'list' }, skeletons(2)), pub: h('div', { class: 'list' }, skeletons(3)), rec: h('div', { class: 'grid' }, skeletons(2, 150)), notes: h('div', { class: 'list' }, skeletons(2, 52)) };
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Home'), h('p', { class: 'muted', style: { margin: 0 } }, 'Everything you’re part of, in one place.')),
    h('a', { class: 'btn primary', href: '#/groups/new' }, icon('plus', 18), 'Create group')),
    h('div', { class: 'home-grid' },
      h('div', null, section('Your groups', slots.groups, h('a', { href: '#/groups', class: 'small', style: { textTransform: 'none', letterSpacing: 0 } }, 'See all')),
        section('Recent activity in public discussions', slots.pub)),
      h('div', null, section('Notifications', slots.notes, h('a', { href: '#/notifications', class: 'small', style: { textTransform: 'none', letterSpacing: 0 } }, 'Open')),
        section('Recent conversations', slots.convs, h('a', { href: '#/messages', class: 'small', style: { textTransform: 'none', letterSpacing: 0 } }, 'Messages')),
        section('Recommended groups', slots.rec))));

  const fill = (slot, p, render) => p.then((d) => slot.replaceChildren(...render(d))).catch((e) => slot.replaceChildren(errorState(e)));
  fill(slots.groups, rpc('my_groups'), (gs) => gs.length ? gs.slice(0, 5).map(myGroupRow) : [empty('users', 'No groups yet', 'Join a community or start your own.', h('a', { class: 'btn primary', href: '#/explore' }, 'Explore groups'))]);
  fill(slots.convs, rpc('my_conversations'), (cs) => cs.length ? cs.slice(0, 4).map((c) => conversationRow(c)) : [empty('chat', 'No private chats', 'Start one from someone’s profile in a shared group.')]);
  fill(slots.pub, rpc('public_discussions', { p_limit: 8 }), (ds) => ds.length ? ds.map(discussionRow) : [empty('compass', 'Nothing yet', 'Public discussions will appear here.')]);
  fill(slots.rec, rpc('recommended_groups', { p_limit: 4 }), (rs) => rs.length ? rs.map(groupCard) : [h('p', { class: 'muted' }, 'You’ve discovered everything we have for now.')]);
  fill(slots.notes, listNotifications(5), (ns) => ns.length ? ns.map((n) => h('a', { class: 'item' + (n.read ? '' : ' unread'), href: n.link || '#/notifications' },
    h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'title truncate' }, n.title), h('div', { class: 'sub truncate' }, n.body || '')), h('span', { class: 'time' }, ago(n.created_at)))) : [h('p', { class: 'muted small' }, 'You’re all caught up.')]);

  // first visit: tell the user their anonymous name once
  try {
    const key = 'unsaid.welcome.' + store.session.user.id;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      const m = modal({ title: 'Welcome to UNSAID', body: h('div', null, h('p', null, 'Your anonymous username is:'),
        h('p', { style: { fontSize: '1.7rem', fontWeight: 800, textAlign: 'center', margin: '14px 0' }, class: 'mono' }, store.account.username),
        h('p', { class: 'muted small' }, 'Only you (and platform safety staff when investigating a report) can see this. Every group and every private chat will give you a different random name, so nobody can link them together.')),
        actions: [h('button', { class: 'btn primary', onclick: () => m.close() }, 'Got it')] });
    }
  } catch { /* storage unavailable */ }
  return { el: root };
}
