import { rpc } from '../supabase.js';
import { h, icon, setTitle, withBusy, toast, CATEGORIES, groupAvatar } from '../ui.js';
import { prepareImage, uploadGroupImage } from '../images.js';
import { navigate } from '../router.js';

export default function groupCreate() {
  setTitle('Create group');
  let img = null;
  const name = h('input', { class: 'input', id: 'gname', maxlength: 60, placeholder: 'e.g. Night Owls', required: true });
  const desc = h('textarea', { class: 'textarea', maxlength: 500, placeholder: 'What is this group about?' });
  const rules = h('textarea', { class: 'textarea', maxlength: 2000, placeholder: '1. Be kind.\n2. No spam.' });
  const cat = h('select', { class: 'select' }, CATEGORIES.map(([k, l]) => h('option', { value: k }, l)));
  const preview = h('div', null, groupAvatar(null, 'G', 72));
  const pick = h('button', { type: 'button', class: 'btn sm', onclick: () => { const i = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    i.onchange = async () => { try { img = await prepareImage(i.files[0], { maxSide: 640 }); preview.replaceChildren(h('span', { class: 'avatar square', style: { width: '72px', height: '72px' } }, h('img', { src: img.url, alt: 'Group image preview' }))); } catch (e) { toast(e.message, 'error'); } }; i.click(); } }, icon('image', 16), 'Choose image');
  const choice = (n, v, t, d, on) => h('label', { class: 'choice' }, h('input', { type: 'radio', name: n, value: v, checked: on }), h('div', null, h('b', null, t), h('div', { class: 'hint' }, d)));
  const err = h('div', { class: 'error-text', role: 'alert' });
  const val = (n) => document.querySelector(`input[name="${n}"]:checked`)?.value;
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Create group');
  const form = h('form', { novalidate: true, class: 'card', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    if (name.value.trim().length < 3) { err.textContent = 'Give your group a name (3–60 characters).'; name.focus(); return; }
    await withBusy(btn, async () => {
      const path = img ? await uploadGroupImage(img) : null;
      const id = await rpc('create_group', { p_name: name.value, p_description: desc.value, p_image_path: path, p_category: cat.value, p_privacy: val('privacy'), p_join_mode: val('join'), p_rules: rules.value });
      toast('Group created. You’re its admin.', 'success'); navigate('/g/' + id);
    });
  } },
    h('div', { class: 'row', style: { marginBottom: '16px' } }, preview, h('div', null, h('div', { class: 'label' }, 'Group image (optional)'), pick)),
    h('div', { class: 'field' }, h('label', { for: 'gname' }, 'Group name'), name),
    h('div', { class: 'field' }, h('label', null, 'Description'), desc),
    h('div', { class: 'field' }, h('label', null, 'Category'), cat),
    h('div', { class: 'field' }, h('label', null, 'Privacy'), h('div', { class: 'stack', style: { gap: '8px' } },
      choice('privacy', 'public', 'Public', 'Anyone can find it in Explore.', true), choice('privacy', 'private', 'Private', 'Hidden. People join only with an invitation link.'))),
    h('div', { class: 'field' }, h('label', null, 'Joining'), h('div', { class: 'stack', style: { gap: '8px' } },
      choice('join', 'open', 'Open', 'People join instantly.', true), choice('join', 'approval', 'Approval needed', 'An admin or moderator approves each request.'))),
    h('div', { class: 'field' }, h('label', null, 'Group rules (optional)'), rules), err,
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('a', { class: 'btn ghost', href: '#/groups' }, 'Cancel'), btn));
  return { el: h('div', { style: { maxWidth: '640px' } }, h('div', { class: 'page-head' }, h('h1', null, 'Create a group')), form,
    h('p', { class: 'hint', style: { marginTop: '10px' } }, 'You’ll get a random anonymous name inside this group — separate from your other names.')) };
}
