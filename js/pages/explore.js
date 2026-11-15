import { rpc } from '../supabase.js';
import { h, icon, empty, errorState, skeletons, setTitle, debounce, CATEGORIES } from '../ui.js';
import { groupCard, discussionRow } from '../views/cards.js';

export default async function explore() {
  setTitle('Explore');
  let cat = '', sort = 'trending', q = '', tab = 'groups';
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search public groups and discussions…', 'aria-label': 'Search', style: { paddingLeft: '42px' } });
  const results = h('div', { class: 'grid cols-2' });
  const rec = h('div', { class: 'grid cols-2' });
  const recSection = h('section', { class: 'section' }, h('h2', null, 'Recommended for you'), rec);
  const chipRow = h('div', { class: 'chips', role: 'tablist' });
  const sortRow = h('div', { class: 'chips' });
  const tabsRow = h('div', { class: 'chips' });

  function paintChips() {
    chipRow.replaceChildren(...[['', 'All'], ...CATEGORIES].map(([k, l]) => h('button', { class: 'chip' + (cat === k ? ' on' : ''), 'aria-pressed': String(cat === k), onclick: () => { cat = k; paintChips(); load(); } }, l)));
    sortRow.replaceChildren(...[['trending', 'Trending'], ['popular', 'Most popular'], ['new', 'Newest']].map(([k, l]) => h('button', { class: 'chip' + (sort === k ? ' on' : ''), 'aria-pressed': String(sort === k), onclick: () => { sort = k; paintChips(); load(); } }, l)));
    tabsRow.replaceChildren(...[['groups', 'Groups'], ['discussions', 'Discussions']].map(([k, l]) => h('button', { class: 'chip' + (tab === k ? ' on' : ''), onclick: () => { tab = k; paintChips(); load(); } }, l)));
  }
  let seq = 0;
  async function load() {
    const my = ++seq; results.className = tab === 'groups' ? 'grid cols-2' : 'list'; results.replaceChildren(skeletons(4, 120));
    recSection.classList.toggle('hidden', !!q || !!cat || tab !== 'groups');
    sortRow.classList.toggle('hidden', tab !== 'groups'); chipRow.classList.toggle('hidden', tab !== 'groups');
    try {
      if (tab === 'groups') {
        const gs = await rpc('explore_groups', { p_query: q || null, p_category: cat || null, p_sort: sort, p_limit: 36, p_offset: 0 });
        if (my !== seq) return;
        results.replaceChildren(...(gs.length ? gs.map(groupCard) : [empty('search', 'No groups found', q ? 'Try different words or another category.' : 'Be the first to create one here.', h('a', { class: 'btn primary', href: '#/groups/new' }, 'Create a group'))]));
      } else {
        const ds = q.length >= 2 ? await rpc('search_discussions', { p_query: q, p_limit: 30 }) : await rpc('public_discussions', { p_limit: 20 });
        if (my !== seq) return;
        results.replaceChildren(...(ds.length ? ds.map(discussionRow) : [empty('chat', q ? 'No discussions match' : 'No public discussions yet', q ? 'Try other words.' : '')]));
      }
    } catch (e) { if (my === seq) results.replaceChildren(errorState(e, load)); }
  }
  search.addEventListener('input', debounce(() => { q = search.value.trim(); load(); }, 350));
  paintChips();
  rpc('recommended_groups', { p_limit: 4 }).then((rs) => rec.replaceChildren(...(rs.length ? rs.map(groupCard) : [h('p', { class: 'muted' }, 'Join a few groups and we’ll tailor suggestions.')]))).catch(() => recSection.classList.add('hidden'));
  load();
  const root = h('div', null, h('div', { class: 'page-head' }, h('h1', null, 'Explore'), h('a', { class: 'btn primary', href: '#/groups/new' }, icon('plus', 18), 'Create group')),
    h('div', { style: { position: 'relative', marginBottom: '12px' } }, h('span', { style: { position: 'absolute', left: '14px', top: '12px', color: 'var(--faint)' } }, icon('search', 20)), search),
    tabsRow, h('div', { style: { height: '10px' } }), chipRow, h('div', { style: { height: '8px' } }), sortRow, h('div', { style: { height: '14px' } }), recSection,
    h('section', { class: 'section' }, results),
    h('p', { class: 'faint small' }, 'Search covers public groups and public discussions only. You can’t look people up — identities are separate in every group.'));
  return { el: root };
}
