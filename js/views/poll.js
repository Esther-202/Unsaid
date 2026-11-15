import { h, modal, toastError, icon, $$ } from '../ui.js';

export function openPollCreator(onSubmit) {
  const q = h('input', { class: 'input', maxlength: 300, placeholder: 'Ask the group something…', 'aria-label': 'Poll question' });
  const opts = h('div', { class: 'stack' });
  const addOpt = (v = '') => { if ($$('input', opts).length >= 8) return; opts.append(h('input', { class: 'input', maxlength: 120, placeholder: 'Option ' + ($$('input', opts).length + 1), value: v })); };
  addOpt(); addOpt();
  const multi = h('input', { type: 'checkbox' });
  const dur = h('select', { class: 'select' }, [['', 'No time limit'], ['1', '1 hour'], ['24', '24 hours'], ['72', '3 days'], ['168', '1 week']].map(([v, l]) => h('option', { value: v }, l)));
  const err = h('div', { class: 'error-text' });
  const m = modal({ title: 'Create a poll', body: h('div', null,
    h('div', { class: 'field' }, h('label', null, 'Question'), q), h('div', { class: 'field' }, h('label', null, 'Options (2–8)'), opts,
      h('button', { type: 'button', class: 'btn ghost sm', style: { alignSelf: 'flex-start' }, onclick: () => addOpt() }, icon('plus', 16), 'Add option')),
    h('label', { class: 'row', style: { marginBottom: '12px' } }, multi, 'Allow multiple answers'),
    h('div', { class: 'field' }, h('label', null, 'Closes'), dur), err, h('p', { class: 'hint' }, 'Votes are anonymous — nobody, including admins of the group, can see who voted for what.')),
    actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: async (e) => {
        const options = $$('input', opts).map((i) => i.value.trim()).filter(Boolean);
        if (q.value.trim().length < 3) { err.textContent = 'Please write a question (3+ characters).'; return; }
        if (options.length < 2) { err.textContent = 'Add at least two options.'; return; }
        e.target.disabled = true;
        try { await onSubmit({ question: q.value.trim(), options, multiple: multi.checked, hours: dur.value ? +dur.value : null }); m.close(); }
        catch (er) { toastError(er); e.target.disabled = false; }
      } }, 'Post poll')] });
}
