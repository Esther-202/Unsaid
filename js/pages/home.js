import { rpc, listNotifications } from '../supabase.js';
import { store } from '../store.js';
import { h, icon, errorState, skeletons, setTitle, modal, ago } from '../ui.js';
import { myGroupRow, conversationRow, discussionRow, groupCard } from '../views/cards.js';
import { navigate } from '../router.js';
import { nextPrompt } from '../prompts.js';

const moreLink = (href, text) => h('a', { href, class: 'small', style: { textTransform: 'none', letterSpacing: 0 } }, text);

export default async function home() {
  setTitle('Home');
  const root = h('div');
  const section = (title, body, more) => { const el = h('section', { class: 'section' }, h('h2', null, title, more), body); return el; };

  // ── a system prompt (written by the UNSAID team, never a fake message) ─────────
  let current = nextPrompt();
  const q = h('div', { class: 'q' }, current);
  const card = h('div', { class: 'prompt-card' },
    h('div', { class: 'kicker' }, icon('sparkles', 15), 'A thought to start with'),
    q,
    h('div', { class: 'acts' },
      h('button', { class: 'btn primary', onclick: () => sayInGroup(current) }, icon('chat', 18), 'Say it in a group'),
      h('button', { class: 'btn ghost', onclick: () => { try { sessionStorage.setItem('unsaid.groupdraft', current); } catch { /* storage unavailable */ } navigate('/groups/new'); } }, 'Start a group about this'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost sm', 'aria-label': 'Show another prompt', onclick: () => { current = nextPrompt(); q.textContent = current; card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap'); } }, icon('refresh', 16), 'Another')));

  async function sayInGroup(text) {
    let gs = [];
    try { gs = (await rpc('my_groups')).filter((g) => g.status !== 'pending'); } catch { /* handled below */ }
    if (!gs.length) {
      const m = modal({ title: 'Join a group first', body: h('p', { class: 'muted' }, 'Prompts are answered inside a group, anonymously. Join one you like, or start your own.'),
        actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Not now'), h('a', { class: 'btn primary', href: '#/explore', onclick: () => m.close() }, 'Explore groups')] });
      return;
    }
    const m = modal({ title: 'Where do you want to say it?', body: h('div', { class: 'stack', style: { gap: '8px' } },
      h('p', { class: 'muted small', style: { margin: 0 } }, 'You’ll be able to edit before anything is posted.'),
      ...gs.slice(0, 12).map((g) => h('button', { class: 'btn block', style: { justifyContent: 'space-between' }, onclick: () => {
        try { sessionStorage.setItem('unsaid.draft', JSON.stringify({ group: g.id, text: text + '\n\n', at: Date.now() })); } catch { /* storage unavailable */ }
        m.close(); navigate('/g/' + g.id);
      } }, h('span', { class: 'truncate' }, g.name), h('span', { class: 'faint small mono' }, g.my_username)))),
      actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel')] });
  }

  // ── content: every block hides itself when it has nothing to show ──────────────
  const slots = { groups: h('div', { class: 'list' }, skeletons(2)), pub: h('div', { class: 'list' }, skeletons(2)), notes: h('div', { class: 'list' }), convs: h('div', { class: 'list' }), rec: h('div', { class: 'grid' }) };
  const sec = {
    groups: section('Your groups', slots.groups, moreLink('#/groups', 'See all')),
    pub: section('Public discussions', slots.pub, moreLink('#/explore', 'Explore')),
    notes: section('New for you', slots.notes, moreLink('#/notifications', 'Open')),
    convs: section('Private chats', slots.convs, moreLink('#/messages', 'Messages')),
    rec: section('Groups you might like', slots.rec),
  };
  sec.notes.classList.add('hidden'); sec.convs.classList.add('hidden'); sec.rec.classList.add('hidden');

  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Home'), h('p', { class: 'muted', style: { margin: 0 } }, 'Say what you really think.')),
      h('a', { class: 'btn', href: '#/groups/new' }, icon('plus', 18), 'Create group')),
    card,
    h('div', { class: 'home-grid' }, h('div', null, sec.groups, sec.pub), h('div', null, sec.notes, sec.convs, sec.rec)));

  const fill = (key, p, render, hideWhenEmpty) => p.then((d) => {
    const kids = render(d);
    if (hideWhenEmpty && !kids.length) { sec[key].classList.add('hidden'); return; }
    sec[key].classList.remove('hidden'); slots[key].replaceChildren(...kids);
  }).catch((e) => { slots[key].replaceChildren(errorState(e)); });

  fill('groups', rpc('my_groups'), (gs) => gs.length ? gs.slice(0, 4).map(myGroupRow)
    : [h('div', { class: 'card', style: { textAlign: 'center' } }, h('p', { class: 'muted', style: { marginTop: 0 } }, 'You haven’t joined any groups yet.'), h('a', { class: 'btn primary', href: '#/explore' }, 'Explore groups'))]);
  fill('pub', rpc('public_discussions', { p_limit: 3 }), (ds) => ds.slice(0, 3).map(discussionRow), true);
  fill('notes', listNotifications(6), (ns) => ns.filter((n) => !n.read).slice(0, 3).map((n) => h('a', { class: 'item unread', href: /^#\//.test(n.link || '') ? n.link : '#/notifications' },
    h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'title truncate' }, n.title), h('div', { class: 'sub truncate' }, n.body || '')), h('span', { class: 'time' }, ago(n.created_at)))), true);
  fill('convs', rpc('my_conversations'), (cs) => cs.slice(0, 3).map((c) => conversationRow(c)), true);
  fill('rec', rpc('recommended_groups', { p_limit: 2 }), (rs) => rs.slice(0, 2).map(groupCard), true);

  // first visit: tell the user their anonymous name once
  try {
    const key = 'unsaid.welcome.' + store.session.user.id;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      const m = modal({ title: 'Welcome to UNSAID', body: h('div', null, h('p', null, 'Your anonymous username is:'),
        h('p', { style: { fontSize: '1.7rem', fontWeight: 800, textAlign: 'center', margin: '14px 0', overflowWrap: 'anywhere' }, class: 'mono' }, store.account.username),
        h('p', { class: 'muted small' }, 'Only you (and platform safety staff when investigating a report) can see this. Every group and every private chat will give you a different random name, so nobody can link them together.')),
        actions: [h('button', { class: 'btn primary', onclick: () => m.close() }, 'Got it')] });
    }
  } catch { /* storage unavailable */ }
  return { el: root };
}
