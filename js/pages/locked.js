// Shown when the account is suspended, banned or deactivated.
import { rpc } from '../supabase.js';
import { store, refreshAccount, signOut } from '../store.js';
import { h, icon, setTitle, toast, withBusy, dateTime } from '../ui.js';
import { navigate } from '../router.js';

export default async function locked() {
  setTitle('Account');
  await refreshAccount().catch(() => {});
  const a = store.account;
  if (!a) return h('div', { class: 'auth-wrap' }, h('p', null, 'Loading…'));
  if (['active', 'restricted'].includes(a.status)) { navigate('/home', { replace: true }); return h('div'); }
  const out = h('button', { class: 'btn', onclick: signOut }, icon('logout', 18), 'Sign out');
  let body;
  if (a.status === 'deactivated') {
    body = [h('h1', null, 'Your account is deactivated'), h('p', { class: 'muted' }, 'Your groups and identities are hidden while it’s deactivated. Reactivate whenever you’re ready — nothing was lost.'),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: (e) => withBusy(e.currentTarget, async () => { await rpc('reactivate_account'); await refreshAccount(); toast('Welcome back!', 'success'); navigate('/home'); }) }, 'Reactivate account'), out)];
  } else {
    const banned = a.status === 'banned';
    body = [h('h1', null, banned ? 'This account has been banned' : 'Your account is suspended'),
      h('p', { class: 'muted' }, banned ? 'This account was permanently removed for breaking the community rules.' : `You can’t use UNSAID until ${a.status_until ? dateTime(a.status_until) : 'a moderator reinstates your account'}.`),
      a.status_reason ? h('div', { class: 'alert' }, h('b', null, 'Reason: '), a.status_reason) : null, h('div', { style: { marginTop: '16px' } }, out)];
  }
  return h('div', { class: 'auth-wrap' }, h('div', { class: 'auth-card' }, h('div', { class: 'empty', style: { padding: '0 0 14px', textAlign: 'left' } }, h('div', { class: 'ico' }, icon('shield', 26))), ...body));
}
