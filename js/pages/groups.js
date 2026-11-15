import { rpc } from '../supabase.js';
import { h, icon, empty, errorState, skeletons, setTitle } from '../ui.js';
import { myGroupRow } from '../views/cards.js';

export default async function groups() {
  setTitle('My Groups');
  const body = h('div', { class: 'list' }, skeletons(4));
  const root = h('div', null, h('div', { class: 'page-head' }, h('h1', null, 'My Groups'), h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/explore' }, icon('compass', 18), 'Explore'), h('a', { class: 'btn primary', href: '#/groups/new' }, icon('plus', 18), 'Create group'))),
    h('div', { class: 'card', style: { padding: '8px' } }, body));
  rpc('my_groups').then((gs) => body.replaceChildren(...(gs.length ? gs.map(myGroupRow) : [empty('users', 'You haven’t joined any groups', 'Find a community that fits you — or start your own.', h('a', { class: 'btn primary', href: '#/explore' }, 'Explore groups'))])))
    .catch((e) => body.replaceChildren(errorState(e)));
  return { el: root };
}
