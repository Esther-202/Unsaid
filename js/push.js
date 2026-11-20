// Push notifications for this device (Web Push). Alerts still work inside the app without it.
import { rpc } from './supabase.js';
import { VAPID_PUBLIC_KEY } from './push-config.js';

const ua = navigator.userAgent || '';
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const b64uToBytes = (s) => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
const bytesToB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 'unsupported' | 'needs-install' (iPhone, not added to Home Screen) | 'denied' | 'off' | 'on' */
export async function pushStatus() {
  if (isIOS && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/') || await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') {
      const st = await rpc('my_push_state', { p_endpoint: sub.endpoint }).catch(() => null);
      return st?.this_device ? 'on' : 'off';
    }
  } catch { /* fall through */ }
  return 'off';
}

/** Must be called from a tap (browsers only allow the permission prompt after a user action). */
export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser can’t receive push notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed. You can allow them in your phone or browser settings.');
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' }); await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  await rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh || bytesToB64u(sub.getKey('p256dh')), p_auth: j.keys?.auth || bytesToB64u(sub.getKey('auth')) });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await rpc('delete_push_subscription', { p_endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
}

/** On sign-out: stop this phone getting the account's pushes (best effort, before the session ends). */
export async function forgetPushOnThisDevice() { try { if ('serviceWorker' in navigator) await disablePush(); } catch { /* ignore */ } }

/** Keeps the worker registered and renews the saved address if the phone changed it. Quiet; only if already allowed. */
export async function refreshPushRegistration() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' }); await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription(); if (!sub) return;
    const j = sub.toJSON(); await rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  } catch { /* try again next launch */ }
}
