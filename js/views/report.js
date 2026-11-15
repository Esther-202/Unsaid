import { rpc } from '../supabase.js';
import { h, modal, toast, toastError } from '../ui.js';

const CATS = [['harassment', 'Harassment'], ['bullying', 'Bullying'], ['threats', 'Threats or violence'], ['spam', 'Spam'],
  ['impersonation', 'Impersonation'], ['inappropriate_image', 'Inappropriate image'], ['other', 'Something else']];

/** target: {type:'user'|'group_message'|'dm_message'|'group'|'image'|'conversation', group?, message?, conversation?, identity?, label} */
export function openReport(target) {
  let cat = '';
  const err = h('div', { class: 'error-text' });
  const details = h('textarea', { class: 'textarea', maxlength: 2000, placeholder: 'Tell us what happened (optional)…', 'aria-label': 'Details' });
  const choices = CATS.filter(([k]) => k !== 'inappropriate_image' || ['group_message', 'dm_message', 'image'].includes(target.type)).map(([k, l]) =>
    h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'cat', value: k, onchange: () => { cat = k; err.textContent = ''; } }), h('span', null, l)));
  const m = modal({ title: 'Report', body: h('div', null,
    h('p', { class: 'muted small' }, target.label ? `You’re reporting: ${target.label}` : ''),
    h('div', { class: 'stack', style: { gap: '8px', marginBottom: '14px' } }, choices), h('div', { class: 'field' }, h('label', null, 'Details'), details), err,
    h('p', { class: 'hint' }, target.conversation ? 'Reporting shares the recent messages of this conversation with UNSAID moderators so they can review it. Nothing else about you is shared with the other person.' : 'Your report is private. The other person is never told who reported them.')),
    actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'btn danger', onclick: async (e) => {
        if (!cat) { err.textContent = 'Please choose a reason.'; return; }
        e.target.disabled = true;
        try {
          await rpc('submit_report', { p_target_type: target.type, p_group: target.group || null, p_message: target.message || null,
            p_conversation: target.conversation || null, p_identity: target.identity || null, p_category: cat, p_details: details.value || null });
          m.close(); toast('Report sent. Thank you for helping keep UNSAID safe.', 'success');
        } catch (er) { toastError(er); e.target.disabled = false; }
      } }, 'Send report')] });
}
