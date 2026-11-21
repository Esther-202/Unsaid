import { rpc } from '../supabase.js';
import { h, icon, setTitle, errorState, skeletons, empty, toast, withBusy, modal } from '../ui.js';
import { postCard } from '../views/daily.js';

export default async function letters() {
  setTitle('Unsent letters');
  const root = h('div');
  const list = h('div', { class: 'stack' }, skeletons(2));
  let sort = 'new';
  async function load() {
    try {
      const r = await rpc('list_letters', { p_sort: sort });
      list.replaceChildren(...(r.length ? r.map((l) => postCard(l, 'letter', 'I felt this')) : [empty('mail', 'No letters yet', 'Write the first one. It stays anonymous.')]));
    } catch (e) { list.replaceChildren(errorState(e, load)); }
  }
  function write() {
    const to = h('input', { class: 'input', maxlength: 40, placeholder: 'To… (optional) e.g. my old friend' });
    const body = h('textarea', { class: 'textarea', rows: 7, maxlength: 1500, placeholder: 'Write what you never sent. At least 20 characters.' });
    const m = modal({ title: 'Write an unsent letter', body: h('div', { class: 'stack' }, h('div', { class: 'field' }, to), h('div', { class: 'field' }, body),
      h('p', { class: 'faint small', style: { margin: 0 } }, 'Posted anonymously. Please don’t include names or details that identify anyone.')),
      actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: (ev) => withBusy(ev.currentTarget, async () => { await rpc('write_letter', { p_body: body.value, p_to: to.value }); m.close(); toast('Letter posted'); sort = 'new'; await load(); }) }, 'Post letter')] });
  }
  const tabs = h('div', { class: 'seg' }, [['new', 'Newest'], ['top', 'Most felt']].map(([k, t]) => h('button', { class: 'btn ghost sm' + (k === sort ? ' on' : ''), onclick: (ev) => { sort = k; [...tabs.children].forEach((c) => c.classList.toggle('on', c === ev.currentTarget)); load(); } }, t)));
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Unsent letters'), h('p', { class: 'muted', style: { margin: 0 } }, 'Things you never got to say. Anonymous, always.')),
      h('button', { class: 'btn primary', onclick: write }, icon('edit', 18), 'Write a letter')),
    h('div', { style: { margin: '0 0 10px' } }, tabs), list);
  load();
  return { el: root };
}
