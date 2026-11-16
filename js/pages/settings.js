import { captchaBox } from '../captcha.js';
// Settings: account & security, notification preferences, privacy & safety.
import { sb, rpc } from '../supabase.js';
import { store, refreshAccount, signOut } from '../store.js';
import { h, icon, setTitle, toast, toastError, withBusy, confirmDialog, modal, empty, errorState, skeletons, ago, errMsg } from '../ui.js';
import { navigate } from '../router.js';
import { clientKey } from '../clientkey.js';

const tabs = (active) => h('nav', { class: 'tabs', 'aria-label': 'Settings sections' }, [['/settings', 'Account'], ['/settings/notifications', 'Notifications'], ['/settings/privacy', 'Privacy & safety']].map(([p, l]) =>
  h('a', { class: 'tab' + (p === active ? ' active' : ''), href: '#' + p, 'aria-current': p === active ? 'page' : null }, l)));
const page = (active, ...kids) => h('div', { style: { maxWidth: '680px' } }, h('div', { class: 'page-head' }, h('h1', null, 'Settings')), tabs(active), ...kids);
const pwProblem = (p) => p.length < 8 ? 'Use at least 8 characters.' : (!/[A-Za-z]/.test(p) || !/\d/.test(p)) ? 'Use a mix of letters and numbers.' : null;


// ── signed-in devices ─────────────────────────────────────────
const deviceName = (d) => [d.browser || 'Browser', d.os ? 'on ' + d.os : ''].join(' ').trim() + (d.device && d.device !== 'desktop' ? ' · ' + d.device : '');
function devicesCard() {
  const box = h('div', { class: 'stack', style: { gap: '8px' } }, skeletons(1, 48));
  const all = h('button', { class: 'btn sm hidden' }, 'Sign out all other devices');
  async function load() {
    try {
      const ds = await rpc('my_sessions', { p_client_key: clientKey() });
      box.replaceChildren(...(ds.length ? ds.map((d) => h('div', { class: 'idrow' },
        h('div', null, h('div', { style: { fontWeight: 600 } }, deviceName(d), d.current ? h('span', { class: 'tag ok', style: { marginLeft: '8px' } }, 'This device') : null),
          h('div', { class: 'hint' }, 'Signed in ' + ago(d.created_at) + ' ago · last active ' + ago(d.last_seen_at) + ' ago')),
        d.current ? null : h('button', { class: 'btn sm', onclick: (e) => withBusy(e.currentTarget, async () => { await rpc('revoke_my_session', { p_session: d.id }); toast('Device signed out', 'success', 1800); load(); }) }, 'Sign out')))
        : [h('p', { class: 'muted small', style: { margin: 0 } }, 'No other devices.')]));
      all.classList.toggle('hidden', ds.filter((d) => !d.current).length < 1);
    } catch (e) { box.replaceChildren(errorState(e, load)); }
  }
  all.onclick = (e) => withBusy(e.currentTarget, async () => { const n = await rpc('revoke_my_other_sessions', { p_client_key: clientKey() }); toast(n ? 'Signed out of ' + n + ' other device' + (n > 1 ? 's' : '') : 'No other devices', 'success'); load(); });
  load();
  return h('div', { class: 'card', style: { marginTop: '16px' } }, h('div', { class: 'card-title' }, h('b', null, 'Where you’re signed in')), box,
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '10px' } }, h('p', { class: 'hint', style: { margin: 0 } }, 'Using a phone and a laptop is normal. If you don’t recognise a device, sign it out and change your password.'), all));
}

// ── change email (the new address must be verified before it takes effect) ──
function changeEmail(current) {
  const box = h('input', { class: 'input', type: 'email', autocomplete: 'email', placeholder: 'new@example.com', 'aria-label': 'New email address' });
  const m = modal({ title: 'Change your email', body: h('div', null, h('p', { class: 'muted small' }, 'We’ll send a verification link to the new address. Your email stays ' + current + ' until you open it.'), box),
    actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: (e) => withBusy(e.currentTarget, async () => {
      const v = box.value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { toast('Enter a valid email address.', 'error'); return; }
      const { error } = await sb.auth.updateUser({ email: v }, { emailRedirectTo: location.origin + location.pathname }); if (error) throw error;
      m.close(); toast('Check the new inbox for a verification link.', 'success', 5000); }) }, 'Send link')] });
}

// ── account & security ────────────────────────────────────────
export async function account() {
  setTitle('Settings');
  const { data } = await sb.auth.getUser();
  const email = data?.user?.email || '';

  const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', id: 'cur' });
  const n1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', id: 'n1' });
  const n2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', id: 'n2' });
  const err = h('div', { class: 'error-text', role: 'alert' });
  const pcap = captchaBox();
  const changeBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Change password');
  const pwForm = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    if (!cur.value) { err.textContent = 'Enter your current password.'; return; }
    const p = pwProblem(n1.value); if (p) { err.textContent = p; return; }
    if (n1.value !== n2.value) { err.textContent = 'New passwords don’t match.'; return; }
    await withBusy(changeBtn, async () => {
      let captchaToken; try { captchaToken = await pcap.token(); } catch (er) { err.textContent = errMsg(er); return; }
      const re = await sb.auth.signInWithPassword({ email, password: cur.value, options: { captchaToken } }); pcap.reset();
      if (re.error) { err.textContent = 'Your current password is incorrect.'; return; }
      const { error } = await sb.auth.updateUser({ password: n1.value });
      if (error) { err.textContent = errMsg(error); return; }
      cur.value = n1.value = n2.value = ''; toast('Password changed', 'success');
    });
  } },
    h('div', { class: 'field' }, h('label', { for: 'cur' }, 'Current password'), cur), h('div', { class: 'field' }, h('label', { for: 'n1' }, 'New password'), n1, h('div', { class: 'hint' }, 'At least 8 characters with letters and numbers.')),
    h('div', { class: 'field' }, h('label', { for: 'n2' }, 'Confirm new password'), n2), pcap.el, err, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, changeBtn));

  async function deactivate() {
    if (!await confirmDialog({ title: 'Deactivate your account?', message: 'Your groups, messages and names are hidden until you sign back in and reactivate. Nothing is deleted.', confirmText: 'Deactivate', danger: true })) return;
    try { await rpc('deactivate_account'); await refreshAccount(); navigate('/account'); } catch (e) { toastError(e); }
  }
  function deleteAccount() {
    const box = h('input', { class: 'input', placeholder: 'Type DELETE to confirm', 'aria-label': 'Type DELETE to confirm' });
    const m = modal({ title: 'Delete your account permanently?', body: h('div', null, h('p', { class: 'muted' }, 'This erases your account, every name you’ve used, your memberships, private chats and reports you sent. It can’t be undone.'), box),
      actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn danger', onclick: async (e) => {
        if (box.value.trim() !== 'DELETE') { box.focus(); return; }
        e.target.disabled = true;
        try { await rpc('delete_my_account'); m.close(); await signOut().catch(() => {}); toast('Your account was deleted.', 'success', 5000); } catch (er) { toastError(er); e.target.disabled = false; }
      } }, 'Delete forever')] });
  }
  return { el: page('/settings',
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, h('b', null, 'Sign-in')),
      h('div', { class: 'setting' }, h('div', null, h('div', { class: 'small muted' }, 'Email (private — never shown to anyone)'), h('div', null, email)), h('div', { class: 'row' }, h('span', { class: 'tag ok' }, 'Verified'), h('button', { class: 'btn sm', onclick: () => changeEmail(email) }, 'Change'))),
      h('div', { class: 'setting' }, h('div', null, h('div', { class: 'small muted' }, 'Your general username'), h('div', { class: 'mono', style: { fontWeight: 650 } }, store.account.username)), h('a', { class: 'btn sm', href: '#/profile' }, 'Edit profile'))),
    h('div', { class: 'card', style: { marginTop: '16px' } }, h('div', { class: 'card-title' }, h('b', null, 'Change password')), pwForm),
    devicesCard(),
    h('div', { class: 'card', style: { marginTop: '16px' } }, h('div', { class: 'card-title' }, h('b', null, 'Session')),
      h('div', { class: 'setting' }, h('div', null, 'Sign out on this device'), h('button', { class: 'btn', onclick: signOut }, icon('logout', 18), 'Sign out')),),
    h('div', { class: 'card', style: { marginTop: '16px', borderColor: 'rgba(240,140,157,.35)' } }, h('div', { class: 'card-title' }, h('b', { style: { color: 'var(--danger)' } }, 'Danger zone')),
      h('div', { class: 'setting' }, h('div', null, h('div', null, 'Deactivate account'), h('div', { class: 'hint' }, 'Hide everything temporarily. Reversible.')), h('button', { class: 'btn', onclick: deactivate }, 'Deactivate')),
      h('div', { class: 'setting' }, h('div', null, h('div', null, 'Delete account'), h('div', { class: 'hint' }, 'Permanent. Removes all your data.')), h('button', { class: 'btn danger', onclick: deleteAccount }, 'Delete')))) };
}

// ── notification preferences ──────────────────────────────────
const NOTIFY = [
  ['notify_group_messages', 'New group messages', 'A rolling “N new messages” alert for groups you haven’t muted.'],
  ['notify_replies', 'Replies to your messages', 'When someone replies to something you wrote.'],
  ['notify_reactions', 'Reactions', 'When someone reacts to your message.'],
  ['notify_invites', 'Group invitations', 'When a member invites you to a group.'],
  ['notify_dm', 'Private messages', 'New messages in your private chats.'],
  ['notify_announcements', 'Group announcements', 'Announcements from group admins and moderators.'],
];
export async function notifications() {
  setTitle('Notification settings');
  const s = store.account.settings || {};
  const rows = NOTIFY.map(([k, t, d]) => {
    const input = h('input', { type: 'checkbox', checked: s[k] !== false, 'aria-label': t });
    input.onchange = async () => {
      input.disabled = true;
      try { await rpc('update_settings', { p_settings: { [k]: input.checked } }); s[k] = input.checked; toast('Saved', 'success', 1200); }
      catch (e) { input.checked = !input.checked; toastError(e); } finally { input.disabled = false; }
    };
    return h('div', { class: 'setting' }, h('div', null, h('div', { style: { fontWeight: 600 } }, t), h('div', { class: 'hint' }, d)), h('label', { class: 'switch' }, input, h('span')));
  });
  return { el: page('/settings/notifications', h('div', { class: 'card' }, ...rows),
    h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Chat-request alerts and safety notices from the UNSAID team are always on. You can also mute any single group or private chat from its menu.')) };
}

// ── privacy & safety ──────────────────────────────────────────
export async function privacy() {
  setTitle('Privacy & safety');
  const s = store.account.settings || {};
  const dm = ['everyone', 'nobody'].map((v) => h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'dm', value: v, checked: (s.dm_policy || 'everyone') === v,
    onchange: async () => { try { await rpc('update_settings', { p_settings: { dm_policy: v } }); s.dm_policy = v; toast('Saved', 'success', 1200); } catch (e) { toastError(e); } } }),
    h('div', null, h('b', null, v === 'everyone' ? 'People in my groups can request a chat' : 'Nobody can request a chat'), h('div', { class: 'hint' }, v === 'everyone' ? 'You always decide whether to accept.' : 'The chat option is hidden from your group profiles.'))));

  const blocksBox = h('div', { class: 'stack', style: { gap: '8px' } }, skeletons(1, 48));
  const reportsBox = h('div', { class: 'stack', style: { gap: '8px' } }, skeletons(1, 48));
  async function loadBlocks() {
    try {
      const bs = await rpc('list_blocks');
      blocksBox.replaceChildren(...(bs.length ? bs.map((b) => h('div', { class: 'idrow' }, h('div', null, h('div', { class: 'mono small' }, b.label), h('div', { class: 'hint' }, 'Blocked ' + ago(b.created_at))),
        h('button', { class: 'btn sm', onclick: (e) => withBusy(e.currentTarget, async () => { await rpc('unblock', { p_block: b.id }); toast('Unblocked', 'success', 1500); loadBlocks(); }) }, 'Unblock'))) : [h('p', { class: 'muted small', style: { margin: 0 } }, 'You haven’t blocked anyone.')]));
    } catch (e) { blocksBox.replaceChildren(errorState(e, loadBlocks)); }
  }
  async function loadReports() {
    try {
      const rs = await rpc('my_reports');
      reportsBox.replaceChildren(...(rs.length ? rs.map((r) => h('div', { class: 'idrow' }, h('div', null, h('div', { class: 'small' }, r.category.replace(/_/g, ' ') + ' · ' + r.target_type.replace(/_/g, ' ')), h('div', { class: 'hint' }, 'Sent ' + ago(r.created_at))),
        h('span', { class: 'tag ' + (r.status === 'resolved' ? 'ok' : r.status === 'dismissed' ? '' : 'warn') }, r.status === 'resolved' ? (r.outcome === 'action_taken' ? 'Action taken' : 'Reviewed') : r.status === 'dismissed' ? 'No violation found' : 'In review'))) : [h('p', { class: 'muted small', style: { margin: 0 } }, 'You haven’t reported anything.')]));
    } catch (e) { reportsBox.replaceChildren(errorState(e, loadReports)); }
  }
  loadBlocks(); loadReports();
  return { el: page('/settings/privacy',
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, h('b', null, 'Private chat requests')), h('div', { class: 'stack', style: { gap: '8px' } }, dm)),
    h('div', { class: 'card', style: { marginTop: '16px' } }, h('div', { class: 'card-title' }, h('b', null, 'Blocked')), blocksBox,
      h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Blocks only apply to the specific name you blocked, so they never reveal who you are elsewhere.')),
    h('div', { class: 'card', style: { marginTop: '16px' } }, h('div', { class: 'card-title' }, h('b', null, 'Your reports')), reportsBox),
    h('div', { class: 'alert info', style: { marginTop: '16px' } }, h('b', null, 'What stays private. '), 'Your email and account ID are never shown to other users or group admins. Only platform safety staff can see the account behind a name, and only while reviewing a report — each lookup is logged.')) };
}
