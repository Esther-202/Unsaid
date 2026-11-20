// Tiny app store: session, own account (general identity), unread counters.
import { sb, rpc, setAccountProblemHandler } from './supabase.js';

export const store = { session: null, account: null, counts: { notifications: 0, dm_requests: 0 }, ready: false };
const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const emit = (evt = 'change', payload) => subs.forEach((fn) => { try { fn(evt, payload); } catch (e) { console.error(e); } });

export async function refreshAccount() {
  if (!store.session) { store.account = null; return null; }
  try { store.account = await rpc('my_account'); } catch (e) { store.account = null; throw e; }
  emit('account'); return store.account;
}
export async function refreshCounts() {
  if (!store.session || !['active', 'restricted'].includes(store.account?.status)) return;
  try { store.counts = await rpc('unread_counts'); emit('counts'); } catch { /* ignore */ }
}

setAccountProblemHandler(() => { if (store.session) refreshAccount().catch(() => {}); });

export async function initStore() {
  const { data } = await sb.auth.getSession();
  store.session = data.session;
  sb.auth.onAuthStateChange((event, session) => {
    store.session = session;
    if (event === 'PASSWORD_RECOVERY') { store.recovery = true; emit('recovery'); return; }
    if (event === 'SIGNED_OUT') { store.account = null; store.counts = { notifications: 0, dm_requests: 0 }; emit('signedout'); return; }
    if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setTimeout(() => refreshAccount().then(() => emit('signedin')).catch(() => emit('signedin')), 0);
  });
  if (store.session) { try { await refreshAccount(); } catch { /* handled by shell */ } }
  store.ready = true;
}
export const isActive = () => ['active', 'restricted'].includes(store.account?.status);
// Signs out THIS device only (other devices stay signed in) and really ends the login on the server.
export async function signOut() {
  try { const { forgetPushOnThisDevice } = await import('./push.js'); await forgetPushOnThisDevice(); } catch { /* best effort */ }
  try { const { clientKey } = await import('./clientkey.js'); await rpc('end_current_session', { p_client_key: clientKey() }); } catch { /* best effort */ }
  await sb.auth.signOut({ scope: 'local' });
}
