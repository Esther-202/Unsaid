import { rpc } from '../supabase.js';
import { groupImageUrl } from '../images.js';
import { h, icon, groupAvatar, setTitle, withBusy, toast, categoryLabel, plural, empty } from '../ui.js';
import { navigate } from '../router.js';

export default async function invite(ctx) {
  setTitle('Group invitation');
  const code = ctx.params.code;
  let g;
  try { g = await rpc('preview_invite', { p_code: code }); } catch (e) { g = null; }
  if (!g) return { el: h('div', { style: { maxWidth: '520px', margin: '30px auto' } }, empty('link', 'Invitation not valid', 'This link has expired, was revoked, or reached its limit. Ask the group for a new one.', h('a', { class: 'btn primary', href: '#/home' }, 'Go home'))) };
  const btn = h('button', { class: 'btn primary block' }, g.requires_approval ? 'Request to join' : 'Join group');
  btn.onclick = () => withBusy(btn, async () => {
    const r = await rpc('join_via_invite', { p_code: code });
    if (r.status === 'active') { toast('Welcome! You have a new anonymous name in this group.', 'success', 4500); navigate('/g/' + r.group_id, { replace: true }); }
    else { toast('Request sent. You’ll be notified when an admin approves it.', 'success', 5000); navigate('/groups', { replace: true }); }
  });
  return { el: h('div', { class: 'card', style: { maxWidth: '520px', margin: '30px auto', textAlign: 'center' } },
    h('div', { style: { display: 'grid', placeItems: 'center', marginBottom: '12px' } }, groupAvatar(groupImageUrl(g.image_path), g.name, 76)),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'You’ve been invited to'), h('h1', null, g.name), h('p', { class: 'muted' }, g.description || ''),
    h('div', { class: 'meta', style: { justifyContent: 'center', marginBottom: '16px' } }, h('span', null, categoryLabel(g.category)), h('span', null, plural(g.member_count, 'member')), h('span', null, g.privacy === 'private' ? '🔒 Private' : '🌐 Public')),
    btn, h('p', { class: 'hint', style: { marginTop: '12px' } }, 'You’ll appear under a random name that’s unique to this group.')) };
}
