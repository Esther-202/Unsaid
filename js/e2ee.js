// End-to-end encryption for private chats (DMs). Runs entirely in the browser (Web Crypto).
//   keys     : one ECDH P-256 key pair PER CONVERSATION (so a key can never link two chats). The private half
//              never leaves this browser; only the public half is stored on the server.
//   secret   : ECDH(my private, their public) -> HKDF-SHA256 -> AES-256-GCM key (same on both sides).
//   messages : "e2e1." + base64url( 12-byte random IV + ciphertext ). The conversation and sender are bound in as
//              authenticated data, so a message can't be moved to another chat or attributed to someone else.
export const PREFIX = 'e2e1.';
export const isE2E = (s) => typeof s === 'string' && s.startsWith(PREFIX);

const te = new TextEncoder(), td = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export function b64u(buf) {
  const a = new Uint8Array(buf); let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ── keys ─────────────────────────────────────────────────────
export async function newKeyPair() {
  const kp = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);   // private key: not extractable
  return { priv: kp.privateKey, pub: b64u(await subtle().exportKey('raw', kp.publicKey)) };
}
async function importPub(pubB64) {
  return subtle().importKey('raw', unb64u(pubB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}
/** Shared AES key for one conversation. Extractable on purpose: it lets a REPORTER hand it to moderators. */
export async function deriveConvKey(priv, otherPubB64, convId) {
  const bits = await subtle().deriveBits({ name: 'ECDH', public: await importPub(otherPubB64) }, priv, 256);
  const hk = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode(convId), info: te.encode('unsaid-dm-v1') }, hk,
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
export const exportKeyB64 = async (key) => b64u(await subtle().exportKey('raw', key));
export const importKeyB64 = (b64) => subtle().importKey('raw', unb64u(b64), { name: 'AES-GCM' }, false, ['decrypt']);

// ── messages ─────────────────────────────────────────────────
const aad = (convId, aliasId) => te.encode(convId + ':' + aliasId);
export async function encryptText(key, convId, aliasId, text) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(convId, aliasId) }, key, te.encode(text)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return PREFIX + b64u(out);
}
/** Returns the text, or null if it can't be opened (wrong key, tampered, or not ours). */
export async function decryptText(key, convId, aliasId, payload) {
  try {
    const raw = unb64u(payload.slice(PREFIX.length));
    if (raw.length < 29) return null;
    return td.decode(await subtle().decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: aad(convId, aliasId) }, key, raw.slice(12)));
  } catch { return null; }
}

/** A short code both people can compare (in person, or another app) to be sure nobody swapped keys. */
export async function safetyCode(pubA, pubB) {
  const [a, b] = [pubA, pubB].sort();
  const h = new Uint8Array(await subtle().digest('SHA-256', te.encode(a + '|' + b)));
  const groups = []; for (let i = 0; i < 12; i += 2) groups.push(String((h[i] << 8 | h[i + 1]) % 100000).padStart(5, '0'));
  return groups.join(' ');
}

// ── key storage (IndexedDB, per signed-in user + conversation) ──
const DB = 'unsaid-e2e', STORE = 'convkeys';
function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
const tx = (db, mode, fn) => new Promise((resolve, reject) => { const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE)); t.oncomplete = () => resolve(req?.result); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error); });
const kid = (uid, conv) => uid + ':' + conv;
export async function getStoredKey(uid, conv) { try { return (await tx(await openDb(), 'readonly', (s) => s.get(kid(uid, conv)))) || null; } catch { return null; } }
/** Saves the pair unless one is already there (two tabs can't overwrite each other). Returns the pair that is stored. */
export async function storeKeyIfAbsent(uid, conv, rec) {
  const db = await openDb();
  const existing = await tx(db, 'readonly', (s) => s.get(kid(uid, conv)));
  if (existing) return existing;
  await tx(db, 'readwrite', (s) => s.add(rec, kid(uid, conv)));
  return rec;
}
export async function replaceStoredKey(uid, conv, rec) { await tx(await openDb(), 'readwrite', (s) => s.put(rec, kid(uid, conv))); return rec; }
export async function storageAvailable() { try { await openDb(); return true; } catch { return false; } }
