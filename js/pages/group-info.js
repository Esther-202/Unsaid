// Group information & settings: members, rules, invitations, join requests, bans, admin settings.
// Group staff only ever see group-specific names — never any other identity of a member.
import { rpc } from '../supabase.js';
import { groupImageUrl, prepareImage, uploadGroupImage } from '../images.js';
import { openReport } from '../views/report.js';
import { h, icon, groupAvatar, avatar, avatarPicker, actionSheet, confirmDialog, promptDialog, modal, toast, toastError, setTitle, withBusy, copyText,
         empty, errorState, skeletons, categoryLabel, plural, dateTime, CATEGORIES } from '../ui.js';
import { navigate } from '../router.js';

const inviteUrl = (code) => `${location.origin}${location.pathname}#/join/${code}`;

export default async function groupInfo(ctx) {
  const gid = ctx.params.id;
  let g;
  try { g = await rpc('get_group_info', { p_group: gid }); } catch { return { el: empty('lock', 'Group not available', 'This group doesn’t exist or you don’t have access to it.', h('a', { class: 'btn primary', href: '#/groups' }, 'My groups')) }; }
  setTitle(g.name + ' · info');
  const active = g.my_status === 'active';
  const isAdmin = g.my_role === 'admin', staff = isAdmin || g.my_role === 'moderator';
  const root = h('div', { style: { maxWidth: '760px' } });
  const reload = () => navigate('/g/' + gid + '/info');   // re-run this page

  // ── header ─────────────────────────────────────────────────
  const muteBtn = h('button', { class: 'btn' + (g.muted ? ' on' : ''), onclick: (e) => withBusy(e.currentTarget, async () => { await rpc('mute_group', { p_group: gid, p_muted: !g.muted }); g.muted = !g.muted; toast(g.muted ? 'Group muted' : 'Group unmuted', 'success', 1800); reload(); }) },
    icon('mute', 18), g.muted ? 'Unmute' : 'Mute');
  root.append(
    h('div', { class: 'page-head' }, h('a', { class: 'btn ghost', href: active ? '#/g/' + gid : '#/groups' }, icon('back', 18), active ? 'Back to chat' : 'Back')),
    h('div', { class: 'card', style: { textAlign: 'center' } },
      h('div', { style: { display: 'grid', placeItems: 'center', marginBottom: '10px' } }, groupAvatar(groupImageUrl(g.image_path), g.name, 84)),
      h('h1', { style: { margin: '0 0 6px' } }, g.name), h('p', { class: 'muted', style: { margin: '0 0 12px', whiteSpace: 'pre-wrap' } }, g.description || 'No description yet.'),
      h('div', { class: 'meta', style: { justifyContent: 'center' } }, h('span', null, categoryLabel(g.category)), h('span', null, plural(g.member_count, 'member')),
        h('span', null, g.privacy === 'private' ? '🔒 Private' : '🌐 Public'), h('span', null, g.join_mode === 'approval' ? 'Approval to join' : 'Open to join'), h('span', null, 'Created ' + new Date(g.created_at).toLocaleDateString())),
      active ? h('div', { class: 'row wrap', style: { justifyContent: 'center', marginTop: '16px' } }, h('a', { class: 'btn primary', href: '#/g/' + gid }, icon('chat', 18), 'Open chat'), muteBtn,
        h('button', { class: 'btn', onclick: () => openReport({ type: 'group', group: gid, label: 'Group: ' + g.name }) }, icon('flag', 18), 'Report'),
        h('button', { class: 'btn danger', onclick: leave }, icon('logout', 18), 'Leave')) : null));

  async function leave() {
    if (!await confirmDialog({ title: 'Leave this group?', message: 'You can rejoin later and you’ll keep the same anonymous name here.', confirmText: 'Leave group', danger: true })) return;
    try { await rpc('leave_group', { p_group: gid }); toast('You left ' + g.name, 'success'); navigate('/groups'); } catch (e) { toastError(e); }
  }
  if (!active) { root.append(h('p', { class: 'muted', style: { marginTop: '16px' } }, g.my_status === 'pending' ? 'Your request is pending approval.' : 'Join this group to see its members and conversation.')); return { el: root }; }

  const section = (title, ...kids) => h('section', { class: 'section', style: { marginTop: '22px' } }, h('h2', null, title), ...kids);

  // ── my identity in this group ──────────────────────────────
  const me = g.my_identity;
  let bioVal = me?.bio || '', avVal = me?.avatar ?? 0;
  const bio = h('textarea', { class: 'textarea', maxlength: 300, placeholder: 'Optional bio, visible only in this group' }); bio.value = bioVal;
  const saveProfile = h('button', { class: 'btn primary sm' }, 'Save');
  saveProfile.onclick = () => withBusy(saveProfile, async () => { await rpc('update_group_profile', { p_group: gid, p_bio: bio.value, p_avatar: avVal }); toast('Saved', 'success', 1600); });
  root.append(section('Your identity in this group',
    h('div', { class: 'card' }, h('div', { class: 'row', style: { marginBottom: '12px' } }, avatar(avVal, me?.username, 46), h('div', null, h('div', { class: 'mono', style: { fontWeight: 700, fontSize: '1.1rem' } }, me?.username), h('div', { class: 'hint' }, 'Random and unique to this group. Nobody can link it to your other names.'))),
      h('div', { class: 'field' }, h('label', null, 'Avatar'), avatarPicker(avVal, (i) => { avVal = i; })), h('div', { class: 'field' }, h('label', null, 'Bio'), bio), h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, saveProfile))));

  if (g.rules) root.append(section('Group rules', h('div', { class: 'card', style: { whiteSpace: 'pre-wrap' } }, g.rules)));

  // ── invitations ────────────────────────────────────────────
  const invBox = h('div', { class: 'card' }, skeletons(1, 60));
  const loadInvites = async () => {
    try {
      const list = await rpc('list_invites', { p_group: gid });
      const live = list.filter((i) => !i.revoked && (!i.expires_at || new Date(i.expires_at) > new Date()) && (i.max_uses == null || i.uses < i.max_uses));
      invBox.replaceChildren(
        h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, h('button', { class: 'btn primary sm', onclick: newInvite }, icon('plus', 16), 'New invitation link'),
          h('button', { class: 'btn sm', onclick: inviteByName }, icon('mail', 16), 'Invite by username')),
        live.length ? h('div', { class: 'stack', style: { gap: '8px' } }, live.map((i) => h('div', { class: 'idrow', style: { flexWrap: 'wrap', gap: '8px' } },
          h('div', { class: 'grow' }, h('div', { class: 'mono small truncate' }, inviteUrl(i.code)),
            h('div', { class: 'hint' }, [i.expires_at ? 'Expires ' + dateTime(i.expires_at) : 'No expiry', i.max_uses ? `${i.uses}/${i.max_uses} uses` : `${i.uses} uses`, i.requires_approval ? 'Needs approval' : null].filter(Boolean).join(' · '))),
          h('div', { class: 'row' },
            h('button', { class: 'iconbtn', 'aria-label': 'Copy link', onclick: () => copyText(inviteUrl(i.code)) }, icon('copy', 18)),
            navigator.share ? h('button', { class: 'iconbtn', 'aria-label': 'Share link', onclick: () => navigator.share({ title: 'Join ' + g.name + ' on UNSAID', url: inviteUrl(i.code) }).catch(() => {}) }, icon('share', 18)) : null,
            staff ? h('button', { class: 'iconbtn', 'aria-label': 'Revoke link', onclick: async () => { if (await confirmDialog({ title: 'Revoke this link?', message: 'Anyone with this link will no longer be able to join.', confirmText: 'Revoke', danger: true })) { try { await rpc('revoke_invite', { p_invite: i.id }); loadInvites(); } catch (e) { toastError(e); } } } }, icon('trash', 18)) : null))))
          : h('p', { class: 'muted small', style: { margin: 0 } }, 'No active invitation links yet.'));
    } catch (e) { invBox.replaceChildren(h('p', { class: 'muted small' }, g.privacy === 'public' && !staff ? 'Only admins and moderators manage invitation links.' : e.message)); }
  };
  function newInvite() {
    const exp = h('select', { class: 'select' }, [['', 'Never expires'], ['1', '1 hour'], ['24', '1 day'], ['168', '7 days'], ['720', '30 days']].map(([v, l]) => h('option', { value: v }, l)));
    const uses = h('select', { class: 'select' }, [['', 'Unlimited uses'], ['1', '1 use'], ['5', '5 uses'], ['25', '25 uses'], ['100', '100 uses']].map(([v, l]) => h('option', { value: v }, l)));
    const appr = h('input', { type: 'checkbox' });
    const m = modal({ title: 'New invitation link', body: h('div', null, h('div', { class: 'field' }, h('label', null, 'Expires'), exp), h('div', { class: 'field' }, h('label', null, 'Maximum uses'), uses),
      h('label', { class: 'row' }, appr, 'Require admin approval for people who use this link')),
      actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async (e) => {
        e.target.disabled = true;
        try { const code = await rpc('create_invite', { p_group: gid, p_hours: exp.value ? +exp.value : null, p_max_uses: uses.value ? +uses.value : null, p_requires_approval: appr.checked }); m.close(); await copyText(inviteUrl(code)); loadInvites(); }
        catch (er) { toastError(er); e.target.disabled = false; } } }, 'Create & copy')] });
  }
  async function inviteByName() {
    const u = await promptDialog({ title: 'Invite by username', label: 'Their general username (they must share it with you)', placeholder: 'e.g. SilentMoon27', confirmText: 'Send invite' });
    if (!u) return;
    try { await rpc('invite_user', { p_group: gid, p_username: u }); toast('If that username exists, they’ve been invited.', 'success', 4500); } catch (e) { toastError(e); }
  }
  root.append(section('Invitations', invBox)); loadInvites();

  // ── join requests (staff) ──────────────────────────────────
  if (staff) {
    const box = h('div', { class: 'card' }, skeletons(1, 50));
    const loadReq = async () => {
      try {
        const rs = await rpc('list_join_requests', { p_group: gid });
        box.replaceChildren(...(rs.length ? rs.map((r) => h('div', { class: 'idrow', style: { marginBottom: '8px' } }, h('div', null, h('span', { class: 'mono', style: { fontWeight: 650 } }, r.username), h('div', { class: 'hint' }, 'Requested ' + dateTime(r.requested_at))),
          h('div', { class: 'row' }, h('button', { class: 'btn sm primary', onclick: (e) => withBusy(e.currentTarget, async () => { await rpc('resolve_join_request', { p_group: gid, p_identity: r.identity_id, p_approve: true }); toast('Approved', 'success', 1500); loadReq(); loadMembers(); }) }, 'Approve'),
            h('button', { class: 'btn sm', onclick: (e) => withBusy(e.currentTarget, async () => { await rpc('resolve_join_request', { p_group: gid, p_identity: r.identity_id, p_approve: false }); loadReq(); }) }, 'Decline')))) : [h('p', { class: 'muted small', style: { margin: 0 } }, 'No pending requests.')]));
      } catch (e) { box.replaceChildren(errorState(e, loadReq)); }
    };
    root.append(section('Membership requests', box)); loadReq();
  }

  // ── members ────────────────────────────────────────────────
  const memBox = h('div', { class: 'card', style: { padding: '8px' } }, skeletons(3, 52));
  async function loadMembers() {
    try {
      const ms = await rpc('list_group_members', { p_group: gid });
      memBox.replaceChildren(...ms.map((m) => h('div', { class: 'item', style: { cursor: 'default' } },
        h('a', { href: `#/p/${gid}/${m.identity_id}`, style: { display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' } },
          avatar(m.avatar, m.username, 40), h('div', { class: 'grow' }, h('span', { class: 'mono', style: { fontWeight: 600 } }, m.username), m.is_me ? h('span', { class: 'tag', style: { marginLeft: '8px' } }, 'You') : null,
            m.role === 'admin' ? h('span', { class: 'tag admin', style: { marginLeft: '8px' } }, 'Admin') : m.role === 'moderator' ? h('span', { class: 'tag mod', style: { marginLeft: '8px' } }, 'Mod') : null)),
        !m.is_me && (staff) && m.role !== 'admin' && (isAdmin || m.role === 'member') ? h('button', { class: 'iconbtn', 'aria-label': 'Manage ' + m.username, onclick: () => manage(m) }, icon('more', 20)) : null)));
    } catch (e) { memBox.replaceChildren(errorState(e, loadMembers)); }
  }
  function manage(m) {
    actionSheet([
      isAdmin ? { label: m.role === 'moderator' ? 'Remove moderator role' : 'Make moderator', icon: 'shield', onClick: async () => { try { await rpc('set_member_role', { p_group: gid, p_identity: m.identity_id, p_role: m.role === 'moderator' ? 'member' : 'moderator' }); loadMembers(); } catch (e) { toastError(e); } } } : null,
      isAdmin && m.role !== 'admin' ? { label: 'Make admin', icon: 'star', onClick: async () => { if (await confirmDialog({ title: 'Make ' + m.username + ' an admin?', message: 'Admins can change settings and manage everyone in this group.', confirmText: 'Make admin' })) { try { await rpc('set_member_role', { p_group: gid, p_identity: m.identity_id, p_role: 'admin' }); loadMembers(); } catch (e) { toastError(e); } } } } : null,
      { label: 'Remove from group', icon: 'logout', danger: true, onClick: async () => { if (await confirmDialog({ title: 'Remove ' + m.username + '?', message: 'They can rejoin unless you ban them.', confirmText: 'Remove', danger: true })) { try { await rpc('remove_member', { p_group: gid, p_identity: m.identity_id }); toast('Removed', 'success', 1500); loadMembers(); } catch (e) { toastError(e); } } } },
      { label: 'Ban from group', icon: 'ban', danger: true, onClick: async () => { const r = await promptDialog({ title: 'Ban ' + m.username, label: 'Reason (optional, only staff can see it)', required: false, confirmText: 'Ban' }); if (r === null) return; try { await rpc('ban_member', { p_group: gid, p_identity: m.identity_id, p_reason: r }); toast('Banned', 'success', 1500); loadMembers(); loadBans?.(); } catch (e) { toastError(e); } } },
    ], h('div', { style: { padding: '6px 14px 10px', fontWeight: 700 }, class: 'mono' }, m.username));
  }
  root.append(section('Members', memBox)); loadMembers();

  // ── banned (staff) ─────────────────────────────────────────
  let loadBans = null;
  if (staff) {
    const box = h('div', { class: 'card' });
    loadBans = async () => {
      try {
        const bs = await rpc('list_banned', { p_group: gid });
        box.replaceChildren(...(bs.length ? bs.map((b) => h('div', { class: 'idrow', style: { marginBottom: '8px' } }, h('div', null, h('span', { class: 'mono' }, b.username), b.reason ? h('div', { class: 'hint' }, b.reason) : null),
          h('button', { class: 'btn sm', onclick: (e) => withBusy(e.currentTarget, async () => { await rpc('unban_member', { p_group: gid, p_identity: b.identity_id }); loadBans(); }) }, 'Unban'))) : [h('p', { class: 'muted small', style: { margin: 0 } }, 'Nobody is banned.')]));
      } catch (e) { box.replaceChildren(errorState(e, loadBans)); }
    };
    root.append(section('Banned members', box)); loadBans();
  }

  // ── admin settings ─────────────────────────────────────────
  if (isAdmin) {
    let img = null;
    const name = h('input', { class: 'input', maxlength: 60, value: g.name });
    const desc = h('textarea', { class: 'textarea', maxlength: 500 }); desc.value = g.description || '';
    const rules = h('textarea', { class: 'textarea', maxlength: 2000, placeholder: '1. Be kind.\n2. No spam.' }); rules.value = g.rules || '';
    const cat = h('select', { class: 'select' }, CATEGORIES.map(([k, l]) => h('option', { value: k, selected: k === g.category }, l)));
    const radio = (n, v, t, d, on) => h('label', { class: 'choice' }, h('input', { type: 'radio', name: n, value: v, checked: on }), h('div', null, h('b', null, t), h('div', { class: 'hint' }, d)));
    const val = (n) => root.querySelector(`input[name="${n}"]:checked`)?.value;
    const preview = h('div', null, groupAvatar(groupImageUrl(g.image_path), g.name, 60));
    const pick = h('button', { type: 'button', class: 'btn sm', onclick: () => { const i = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
      i.onchange = async () => { try { img = await prepareImage(i.files[0], { maxSide: 640 }); preview.replaceChildren(h('span', { class: 'avatar square', style: { width: '60px', height: '60px' } }, h('img', { src: img.url, alt: 'New group image preview' }))); } catch (e) { toastError(e); } }; i.click(); } }, icon('image', 16), 'Change image');
    const save = h('button', { class: 'btn primary' }, 'Save settings');
    save.onclick = () => withBusy(save, async () => {
      if (name.value.trim().length < 3) throw new Error('Group name must be 3–60 characters.');
      const path = img ? await uploadGroupImage(img) : null;
      await rpc('update_group', { p_group: gid, p_name: name.value, p_description: desc.value, p_image_path: path, p_category: cat.value, p_privacy: val('privacy'), p_join_mode: val('join'), p_rules: rules.value, p_posting_policy: val('posting') });
      toast('Group settings saved', 'success'); reload();
    });
    root.append(section('Group settings (admins)', h('div', { class: 'card' },
      h('div', { class: 'row', style: { marginBottom: '14px' } }, preview, pick),
      h('div', { class: 'field' }, h('label', null, 'Name'), name), h('div', { class: 'field' }, h('label', null, 'Description'), desc), h('div', { class: 'field' }, h('label', null, 'Category'), cat),
      h('div', { class: 'field' }, h('label', null, 'Privacy'), h('div', { class: 'stack', style: { gap: '8px' } }, radio('privacy', 'public', 'Public', 'Listed in Explore.', g.privacy === 'public'), radio('privacy', 'private', 'Private', 'Hidden; invitation only.', g.privacy === 'private'))),
      h('div', { class: 'field' }, h('label', null, 'Joining'), h('div', { class: 'stack', style: { gap: '8px' } }, radio('join', 'open', 'Open', 'People join instantly.', g.join_mode === 'open'), radio('join', 'approval', 'Approval needed', 'Staff approve each request.', g.join_mode === 'approval'))),
      h('div', { class: 'field' }, h('label', null, 'Who can post'), h('div', { class: 'stack', style: { gap: '8px' } }, radio('posting', 'everyone', 'All members', 'Everyone can send messages.', g.posting_policy === 'everyone'), radio('posting', 'staff', 'Admins & moderators only', 'Others can read and react.', g.posting_policy === 'staff'))),
      h('div', { class: 'field' }, h('label', null, 'Group rules'), rules),
      h('div', { class: 'row', style: { justifyContent: 'space-between', flexWrap: 'wrap' } },
        h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog({ title: 'Delete this group?', message: 'All messages, polls and memberships are permanently deleted for everyone. This cannot be undone.', confirmText: 'Delete group', danger: true })) { try { await rpc('delete_group', { p_group: gid }); toast('Group deleted', 'success'); navigate('/groups'); } catch (e) { toastError(e); } } } }, icon('trash', 18), 'Delete group'), save))));
  }
  return { el: root };
}
