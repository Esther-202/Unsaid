// Profiles. myProfile = your general anonymous identity. anonymousProfile = someone's identity
// inside ONE group (reached from that group only — there is no global directory).
import { rpc } from '../supabase.js';
import { store, refreshAccount } from '../store.js';
import { openReport } from '../views/report.js';
import { h, icon, avatar, avatarPicker, confirmDialog, toast, toastError, setTitle, withBusy, empty } from '../ui.js';
import { navigate } from '../router.js';

export function myProfile() {
  setTitle('Profile');
  const a = store.account;
  let av = a.avatar ?? 0;
  const bio = h('textarea', { class: 'textarea', maxlength: 300, placeholder: 'Optional. Say something about yourself without saying who you are.' }); bio.value = a.bio || '';
  const hero = h('div', { class: 'profile-hero' });
  const paint = () => hero.replaceChildren(avatar(av, a.username, 84), h('div', { class: 'mono', style: { fontSize: '1.5rem', fontWeight: 800 } }, a.username), h('span', { class: 'tag' }, 'Your general identity'));
  paint();
  const save = h('button', { class: 'btn primary' }, 'Save profile');
  save.onclick = () => withBusy(save, async () => { await rpc('update_my_profile', { p_bio: bio.value, p_avatar: av }); await refreshAccount(); toast('Profile saved', 'success', 1800); });
  return { el: h('div', { style: { maxWidth: '640px' } },
    h('div', { class: 'page-head' }, h('h1', null, 'Your profile')),
    h('div', { class: 'card' }, hero,
      h('div', { class: 'field' }, h('label', null, 'Avatar'), avatarPicker(av, (i) => { av = i; paint(); })),
      h('div', { class: 'field' }, h('label', null, 'Bio'), bio),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, save)),
    h('div', { class: 'alert info', style: { marginTop: '16px' } }, h('b', null, 'How your names work. '),
      'This general name is never shown inside groups or private chats. Each group and each private conversation gives you a different random name, and nobody — including group admins — can connect them.'),
    h('div', { class: 'row wrap', style: { marginTop: '16px' } }, h('a', { class: 'btn', href: '#/groups' }, icon('users', 18), 'See my group names'), h('a', { class: 'btn', href: '#/settings/privacy' }, icon('shield', 18), 'Privacy settings'))) };
}

export async function anonymousProfile(ctx) {
  const { group, identity } = ctx.params;
  let p;
  try { p = await rpc('get_identity_profile', { p_group: group, p_identity: identity }); }
  catch (e) { return { el: empty('user', 'Profile not available', e.message, h('a', { class: 'btn', href: '#/groups' }, 'My groups')) }; }
  setTitle(p.username);
  const actions = h('div', { class: 'row wrap', style: { justifyContent: 'center', marginTop: '10px' } });
  const note = h('p', { class: 'hint', style: { marginTop: '12px' } });

  function paintActions() {
    actions.replaceChildren();
    if (p.is_me) { actions.append(h('a', { class: 'btn', href: '#/g/' + group + '/info' }, 'Edit my identity in this group')); note.textContent = 'This is how others see you in this group.'; return; }
    const reqBtn = h('button', { class: 'btn primary' }, icon('chat', 18), 'Request private chat');
    reqBtn.onclick = () => withBusy(reqBtn, async () => {
      const r = await rpc('send_dm_request', { p_group: group, p_identity: identity });
      if (r.state === 'connected') { navigate('/messages/' + r.conversation_id); return; }
      if (r.state === 'unavailable') { p.dm_state = 'unavailable'; toast('This person isn’t accepting private chats.', 'info', 4000); }
      else { p.dm_state = 'pending'; toast('Request sent. They’ll choose whether to accept.', 'success', 4000); }
      paintActions();
    });
    if (p.blocked) actions.append(h('span', { class: 'tag danger' }, 'Blocked'));
    else if (p.dm_state === 'available') actions.append(reqBtn);
    else if (p.dm_state === 'pending') actions.append(h('button', { class: 'btn', disabled: true }, icon('clock', 18), 'Request pending'));
    else if (p.dm_state === 'connected') actions.append(h('a', { class: 'btn primary', href: '#/messages/' + p.conversation_id }, icon('chat', 18), 'Open private chat'));
    else actions.append(h('button', { class: 'btn', disabled: true }, 'Private chat unavailable'));
    if (!p.blocked) actions.append(h('button', { class: 'btn danger', onclick: block }, icon('ban', 18), 'Block'));
    actions.append(h('button', { class: 'btn', onclick: () => openReport({ type: 'user', group, identity, label: p.username }) }, icon('flag', 18), 'Report'));
    note.textContent = 'Private chats use brand-new random names for both of you. Your names in this and other groups stay hidden.';
  }
  async function block() {
    if (!await confirmDialog({ title: `Block ${p.username}?`, message: 'You won’t see their messages in this group, and they can’t contact you. Unblock anytime in Settings → Privacy.', confirmText: 'Block', danger: true })) return;
    try { await rpc('block_identity', { p_context: 'group', p_scope: group, p_identity: identity }); p.blocked = true; toast('Blocked', 'success'); paintActions(); } catch (e) { toastError(e); }
  }
  paintActions();
  return { el: h('div', { style: { maxWidth: '560px' } },
    h('div', { class: 'page-head' }, h('a', { class: 'btn ghost', href: '#/g/' + group }, icon('back', 18), 'Back to group')),
    h('div', { class: 'card', style: { textAlign: 'center' } }, h('div', { class: 'profile-hero' }, avatar(p.avatar, p.username, 92), h('div', { class: 'mono', style: { fontSize: '1.5rem', fontWeight: 800 } }, p.username),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, p.role === 'admin' ? h('span', { class: 'tag admin' }, 'Group admin') : p.role === 'moderator' ? h('span', { class: 'tag mod' }, 'Moderator') : null, p.joined_at ? h('span', { class: 'faint small' }, 'Joined ' + new Date(p.joined_at).toLocaleDateString()) : null),
      p.bio ? h('p', { style: { maxWidth: '420px', whiteSpace: 'pre-wrap' } }, p.bio) : h('p', { class: 'muted' }, 'No bio yet.')), actions, note)) };
}
