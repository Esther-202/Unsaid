// A random key that stays in this browser so the app can tell "this device" from "another device".
// It is NOT a fingerprint: it is just random bytes, and the server only stores a hash of it.
const KEY = 'unsaid.ck';
let memory = null;
const random = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
export function clientKey() {
  try {
    let k = localStorage.getItem(KEY);
    if (!k || k.length < 16) { k = random(); localStorage.setItem(KEY, k); }
    return k;
  } catch { return memory || (memory = random()); }
}
