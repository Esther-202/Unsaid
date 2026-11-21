import { rpc } from '../supabase.js';
import { h, icon, setTitle, errorState, skeletons, empty, toastError, toast, withBusy } from '../ui.js';
import { todayPrompt } from '../prompts.js';
import { postCard, moodRow, streakChip } from '../views/daily.js';

export default async function today() {
  setTitle('Today');
  const root = h('div');
  const list = h('div', { class: 'stack' }, skeletons(2));
  let st, sort = 'top';
  try { st = await rpc('today_state'); } catch (e) { return { el: errorState(e, () => location.reload()) }; }

  const box = h('textarea', { class: 'textarea', maxlength: 280, rows: 3, placeholder: 'Your answer, anonymously…', 'aria-label': 'Your answer' });
  const count = h('span', { class: 'faint small' }, '0/280');
  box.addEventListener('input', () => { count.textContent = `${box.value.length}/280`; });
  const comp = h('div', { class: 'composer card' });
  const drawComposer = () => {
    if (st.answer) {
      comp.replaceChildren(h('div', { class: 'faint small' }, 'Your answer today'), h('p', { class: 'body' }, st.answer.body),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost sm', onclick: () => { box.value = st.answer.body; count.textContent = `${box.value.length}/280`; st.answer = null; drawComposer(); box.focus(); } }, icon('edit', 15), 'Edit')));
    } else {
      comp.replaceChildren(box, h('div', { class: 'row' }, count, h('span', { class: 'spacer' }),
        h('button', { class: 'btn primary', onclick: (ev) => withBusy(ev.currentTarget, async () => {
          const b = box.value.trim(); if (!b) { box.focus(); return; }
          await rpc('answer_today', { p_body: b }); st.answer = { body: b }; toast('Posted anonymously'); drawComposer(); await load(); const s = await rpc('today_state'); st.streak = s.streak; streak.replaceWith((streak = streakChip(st.streak)));
        }) }, 'Post anonymously')));
    }
  };
  async function load() {
    try {
      const r = await rpc('list_answers', { p_sort: sort });
      list.replaceChildren(...(r.length ? r.map((a) => postCard(a, 'answer', 'Me too')) : [empty('chat', 'No answers yet', 'Be the first. Nobody will know it’s you.')]));
    } catch (e) { list.replaceChildren(errorState(e, load)); }
  }
  const tabs = h('div', { class: 'seg' }, ['top', 'new'].map((k) => h('button', { class: 'btn ghost sm' + (k === sort ? ' on' : ''), onclick: (ev) => { sort = k; [...tabs.children].forEach((c) => c.classList.toggle('on', c === ev.currentTarget)); load(); } }, k === 'top' ? 'Most “me too”' : 'Newest')));
  let streak = streakChip(st.streak);
  drawComposer();
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Today'), h('p', { class: 'muted', style: { margin: 0 } }, 'Everyone answers the same question. Nobody knows who said what.')), streak),
    h('div', { class: 'prompt-card' }, h('div', { class: 'kicker' }, icon('sparkles', 15), 'Today’s question'), h('div', { class: 'q' }, todayPrompt())),
    comp,
    h('h2', { class: 'sec' }, 'How are you feeling?'), moodRow(st.mood),
    h('div', { class: 'row', style: { justifyContent: 'space-between', margin: '18px 0 8px' } }, h('h2', { class: 'sec', style: { margin: 0 } }, `Answers (${st.answers})`), tabs),
    list);
  load();
  return { el: root };
}
