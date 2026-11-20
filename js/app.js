// UNSAID bootstrap: setup check → store → shell/layout → routes.
import { isConfigured, SUPABASE_URL } from './config.js';
import { h, $, $$, mount, clear, icon, avatar, loading, actionSheet, setTitle, toast } from './ui.js';

const app = document.getElementById('app');

if (!isConfigured()) {
  app.replaceChildren(h('div', { class: 'auth-wrap' }, h('div', { class: 'auth-card' },
    h('h1', null, 'Almost there'),
    h('p', { class: 'muted' }, 'Connect UNSAID to your Supabase project:'),
    h('ol', { class: 'muted' }, h('li', null, 'Run the SQL files from the supabase/ folder (see README.md).'),
      h('li', null, ['Open ', h('span', { class: 'kbd' }, 'js/config.js'), ' and paste your Project URL and anon key.']),
      h('li', null, 'Reload this page.')))));
  throw new Error('UNSAID is not configured yet (js/config.js).');
}

const { store, initStore, subscribe, refreshAccount, refreshCounts, isActive, signOut } = await import('./store.js');
const { route, setMount, setGuard, navigate, start, resolve, parseHash } = await import('./router.js');
const { startNotificationWatcher, stopNotificationWatcher } = await import('./realtime.js');
const { startSessionWatch, stopSessionWatch } = await import('./session.js');
const { initKeys, resetKeyState, S: keyS } = await import('./keys.js');

// End-to-end encryption keys: made on first launch, topped up, restored from backup on a new device (see js/keys.js).
let keyPrompted = false;
async function bootKeys() {
  if (!store.session || !isActive()) return;
  const uid = store.session.user.id;
  if (keyS.uid === uid && keyS.status !== 'idle') return;
  await initKeys(uid);
  if (keyS.status === 'need-restore' && !keyPrompted) { keyPrompted = true; const m = await import('./views/keyui.js'); m.openRestore(() => navigate(location.hash.slice(1) || '/home', { replace: true })); }
}
subscribe((evt) => { if (evt === 'signedin' || evt === 'account') { bootKeys().catch(() => {}); import('./push.js').then((m) => m.refreshPushRegistration()).catch(() => {}); } if (evt === 'signedout') { resetKeyState(); keyPrompted = false; } });

// ── routes ───────────────────────────────────────────────────
const lazy = (file, fn = 'default') => (ctx) => import(file).then((m) => m[fn](ctx));
route('/', lazy('./pages/landing.js'), { layout: 'bare', auth: 'out' });
route('/login', lazy('./pages/auth.js', 'login'), { layout: 'bare', auth: 'out' });
route('/register', lazy('./pages/auth.js', 'register'), { layout: 'bare', auth: 'out' });
route('/forgot', lazy('./pages/auth.js', 'forgot'), { layout: 'bare', auth: 'out' });
route('/verify', lazy('./pages/auth.js', 'verify'), { layout: 'bare', auth: 'any' });
route('/reset', lazy('./pages/auth.js', 'reset'), { layout: 'bare', auth: 'any' });
route('/account', lazy('./pages/locked.js'), { layout: 'bare', auth: 'in', allowLocked: true });
route('/home', lazy('./pages/home.js'), { auth: 'in' });
route('/explore', lazy('./pages/explore.js'), { auth: 'in' });
route('/groups', lazy('./pages/groups.js'), { auth: 'in' });
route('/groups/new', lazy('./pages/group-create.js'), { auth: 'in' });
route('/join/:code', lazy('./pages/invite.js'), { auth: 'in', joinGate: true });
route('/g/:id', lazy('./pages/group-chat.js'), { layout: 'chat', auth: 'in' });
route('/g/:id/info', lazy('./pages/group-info.js'), { auth: 'in' });
route('/p/:group/:identity', lazy('./pages/profile.js', 'anonymousProfile'), { auth: 'in' });
route('/messages', lazy('./pages/messages.js', 'list'), { auth: 'in' });
route('/messages/requests', lazy('./pages/messages.js', 'requests'), { auth: 'in' });
route('/messages/:id', lazy('./pages/messages.js', 'conversation'), { layout: 'chat', auth: 'in' });
route('/notifications', lazy('./pages/notifications.js'), { auth: 'in' });
route('/profile', lazy('./pages/profile.js', 'myProfile'), { auth: 'in' });
route('/settings', lazy('./pages/settings.js', 'account'), { auth: 'in' });
route('/settings/notifications', lazy('./pages/settings.js', 'notifications'), { auth: 'in' });
route('/settings/privacy', lazy('./pages/settings.js', 'privacy'), { auth: 'in' });
route('/__404__', lazy('./pages/notfound.js'), { notFound: true, auth: 'any', layout: 'bare' });

setGuard((opts, path) => {
  const signedIn = !!store.session;
  if (opts.auth === 'in' && !signedIn) { sessionStorage.setItem('unsaid.next', location.hash); return '/login'; }
  if (opts.auth === 'out' && signedIn) return isActive() || !store.account ? '/home' : '/account';
  if (signedIn && store.account && !isActive() && !opts.allowLocked && opts.auth !== 'any') return '/account';
  return null;
});

// ── shell ────────────────────────────────────────────────────
const NAV = [
  ['/home', 'Home', 'home'], ['/explore', 'Explore', 'compass'], ['/groups', 'My Groups', 'users'],
  ['/messages', 'Messages', 'chat'], ['/notifications', 'Notifications', 'bell'], ['/profile', 'Profile', 'user'], ['/settings', 'Settings', 'settings'],
];
const BOTTOM = ['/home', '/explore', '/groups', '/messages', '/notifications'];
let kind = null, viewEl = null;

const brand = () => h('a', { class: 'brand', href: '#/home', 'aria-label': 'UNSAID home' }, h('span', { class: 'brand-mark' }, icon('ghost', 17)), 'UNSAID');

function buildShell() {
  const link = (p, label, ic, sidebar) => h('a', { class: 'navlink', href: '#' + p, dataset: { path: p }, 'aria-label': label },
    icon(ic, 22), h('span', null, label), h('span', { class: 'badge hidden', dataset: { badge: p } }));
  const me = h('div', { class: 'me' }, h('div', { dataset: { slot: 'me-avatar' } }), h('div', { class: 'grow', style: { minWidth: 0 } },
    h('div', { class: 'small muted' }, 'Your private identity'), h('div', { class: 'truncate', style: { fontWeight: 600 }, dataset: { slot: 'me-name' } }, '…')),
    h('button', { class: 'iconbtn', 'aria-label': 'Sign out', title: 'Sign out', onclick: doSignOut }, icon('logout', 18)));
  const sidebar = h('aside', { class: 'sidebar', 'aria-label': 'Main' }, brand(),
    h('a', { class: 'btn primary block', href: '#/groups/new', style: { marginBottom: '10px' } }, icon('plus', 18), 'Create group'),
    NAV.map(([p, l, i]) => link(p, l, i, true)), h('div', { class: 'spacer' }), me);
  const top = h('header', { class: 'topbar' }, brand(), h('div', { class: 'grow' }),
    h('a', { class: 'btn primary sm', href: '#/groups/new' }, icon('plus', 16), 'Group'),
    h('button', { class: 'iconbtn', 'aria-label': 'Account menu', dataset: { slot: 'menu' }, onclick: openMenu }, h('span', { dataset: { slot: 'top-avatar' } })));
  const bottom = h('nav', { class: 'bottomnav', 'aria-label': 'Main' }, NAV.filter((n) => BOTTOM.includes(n[0])).map(([p, l, i]) => link(p, l === 'My Groups' ? 'Groups' : l === 'Notifications' ? 'Alerts' : l, i)));
  viewEl = h('main', { class: 'main', id: 'view', tabindex: '-1' });
  return h('div', null, h('div', { class: 'shell' }, sidebar, h('div', { class: 'content' }, top, h('div', { id: 'banner' }), viewEl)), bottom);
}
function openMenu() {
  actionSheet([
    { label: 'My profile', icon: 'user', onClick: () => navigate('/profile') }, { label: 'Settings', icon: 'settings', onClick: () => navigate('/settings') },
    { label: 'Privacy & safety', icon: 'shield', onClick: () => navigate('/settings/privacy') }, { label: 'Sign out', icon: 'logout', danger: true, onClick: doSignOut }],
    h('div', { style: { padding: '6px 14px 10px' } }, h('div', { class: 'small muted' }, 'Signed in anonymously as'), h('div', { style: { fontWeight: 700 } }, store.account?.username || '')));
}
async function doSignOut() { await signOut(); toast('Signed out. See you soon.', 'info', 2200); }

function paintChrome() {
  const a = store.account;
  $$('[data-slot="me-avatar"]').forEach((s) => s.replaceChildren(avatar(a?.avatar, a?.username || '', 36)));
  $$('[data-slot="top-avatar"]').forEach((s) => s.replaceChildren(avatar(a?.avatar, a?.username || '', 30)));
  $$('[data-slot="me-name"]').forEach((s) => { s.textContent = a?.username || ''; });
  const counts = { '/notifications': store.counts.notifications, '/messages': store.counts.dm_requests };
  $$('[data-badge]').forEach((b) => { const n = counts[b.dataset.badge] || 0; b.textContent = n > 99 ? '99+' : n; b.classList.toggle('hidden', !n); });
  const ban = $('#banner');
  if (ban) { clear(ban); if (a?.status === 'restricted') ban.append(h('div', { class: 'banner' }, 'Your account is restricted: you can read, but not post or message.' + (a.status_until ? ' Until ' + new Date(a.status_until).toLocaleString() + '.' : ''))); }
}
function markActive(path) {
  $$('.navlink').forEach((n) => {
    const p = n.dataset.path, on = path === p || (p !== '/home' && path.startsWith(p + '/')) || (p === '/groups' && path.startsWith('/g/')) || (p === '/profile' && path.startsWith('/p/'));
    n.classList.toggle('active', !!on); on ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current');
  });
}

setMount((layout, node, opts, path) => {
  const want = layout === 'bare' ? 'bare' : 'shell';
  if (want !== kind) {
    kind = want;
    if (want === 'shell') { app.replaceChildren(buildShell()); paintChrome(); }
    else { viewEl = h('div', { class: 'bare' }); app.replaceChildren(viewEl); }
    if (want === 'bare') { document.body.classList.remove('chat-open', 'wide-page'); }
  }
  document.body.classList.toggle('chat-open', layout === 'chat');
  if (want === 'shell') markActive(path);
  if (!node) { viewEl.replaceChildren(loading('Loading')); return; }
  viewEl.replaceChildren(node);
  if (!/^\/(messages|g\/[^/]+$)/.test(path)) document.body.classList.remove('wide-page');
});

// ── lifecycle events ─────────────────────────────────────────
subscribe((evt) => {
  if (evt === 'account' || evt === 'counts') paintChrome();
  if (evt === 'signedin') {
    startNotificationWatcher(); startSessionWatch(); refreshCounts();
    const { path } = parseHash();
    if (['/', '/login', '/register', '/forgot'].includes(path)) { const next = sessionStorage.getItem('unsaid.next'); sessionStorage.removeItem('unsaid.next'); navigate(next && next.startsWith('#/') ? next : (isActive() ? '/home' : '/account'), { replace: true }); }
    else resolve();
  }
  if (evt === 'signedout') { stopNotificationWatcher(); stopSessionWatch(); navigate('/', { replace: true }); }
  if (evt === 'recovery') navigate('/reset', { replace: true });
});

// ── boot ─────────────────────────────────────────────────────
const url = new URL(location.href);
const hashParams = new URLSearchParams((location.hash.split('?')[1] || '') || location.hash.replace(/^#/, ''));
const authError = url.searchParams.get('error_description') || hashParams.get('error_description');
const authErrorCode = url.searchParams.get('error_code') || hashParams.get('error_code') || '';
const recoveryFlow = url.searchParams.get('flow') === 'recovery';
const hadCode = url.searchParams.has('code');
await initStore();
if (url.searchParams.has('code') || url.searchParams.has('flow') || url.searchParams.has('error_description')) {
  ['code', 'flow', 'error', 'error_code', 'error_description'].forEach((k) => url.searchParams.delete(k));
  history.replaceState(null, '', url.pathname + (url.search || '') + (location.hash || ''));
}
if (authError) {
  if (/expired|invalid/i.test(authErrorCode + ' ' + authError)) { history.replaceState(null, '', recoveryFlow ? '#/forgot' : '#/verify?expired=1'); if (recoveryFlow) toast('That reset link has expired. Request a new one.', 'error', 7000); }
  else toast(authError.replace(/\+/g, ' '), 'error', 7000);
}
if (store.session) { startNotificationWatcher(); startSessionWatch(); }
if (recoveryFlow && !store.session && hadCode && !authError) { history.replaceState(null, '', '#/forgot'); toast('Open the reset link in the same browser where you asked for it (same phone or computer, not a different one). Or request a new link here.', 'info', 9000); }
else if (recoveryFlow && store.session) history.replaceState(null, '', '#/reset');
else if (store.session && (!location.hash || location.hash === '#/')) history.replaceState(null, '', isActive() ? '#/home' : '#/account');
await start();
bootKeys().catch(() => {});
window.addEventListener('focus', () => { if (store.session) { refreshCounts(); } });
