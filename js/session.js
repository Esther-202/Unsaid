// Keeps the server informed about which devices are signed in, and reacts when this device is told to sign out.
// Nothing about the person is collected here: only the browser family / system the site already receives.
import { rpc } from './supabase.js';
import { store, signOut } from './store.js';
import { clientKey } from './clientkey.js';
import { toast } from './ui.js';

let timer = null, busy = false;

async function endedByServer() {
  stopSessionWatch();
  toast('You were signed out on this device.', 'info', 6000);
  await signOut().catch(() => {});
}

async function beat(register) {
  if (busy || !store.session || (!register && document.hidden)) return;
  busy = true;
  try {
    const key = clientKey();
    if (register) {
      const r = await rpc('register_session', { p_client_key: key, p_user_agent: navigator.userAgent });
      if (r?.revoked) await endedByServer();
    } else {
      const r = await rpc('touch_session', { p_client_key: key });
      if (r?.revoked) await endedByServer();
      else if (r && r.known === false) await rpc('register_session', { p_client_key: key, p_user_agent: navigator.userAgent });
    }
  } catch { /* offline, or the account is locked: the rest of the app already handles that */ }
  finally { busy = false; }
}
const onVisible = () => { if (!document.hidden) beat(false); };

export function startSessionWatch() {
  stopSessionWatch();
  if (!store.session) return;
  beat(true);
  timer = setInterval(() => beat(false), 5 * 60 * 1000);
  document.addEventListener('visibilitychange', onVisible);
}
export function stopSessionWatch() {
  if (timer) clearInterval(timer); timer = null;
  document.removeEventListener('visibilitychange', onVisible);
}
