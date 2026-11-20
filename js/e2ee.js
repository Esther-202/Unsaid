// End-to-end encryption for private chats (DMs). Runs entirely in the browser (Web Crypto).
//   seed     : one random 32-byte master seed per account, made on first launch. It never leaves the device
//              unencrypted. Every chat key below is derived from it, so ONE small backup restores them all.
//   keys     : one ECDH P-256 key pair PER CONVERSATION (so a key can never link two chats), derived from the seed
//              (or, for chats made before the seed existed, random and stored on the device). Only public halves go
//              to the server. "Pre-made" one-time keys let a chat start while the other person is offline.
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

// ── master seed → keys ───────────────────────────────────────
import { N as P256_N, pubFromScalar } from './vendor/p256.js';
const bytesToBig = (u8) => u8.reduce((a, b) => (a << 8n) | BigInt(b), 0n);
const bigTo32 = (n) => { const o = new Uint8Array(32); for (let i = 31; i >= 0; i--) { o[i] = Number(n & 255n); n >>= 8n; } return o; };
export const newSeed = () => globalThis.crypto.getRandomValues(new Uint8Array(32));
async function hkdfBits(seed, info, nBytes) {
  const k = await subtle().importKey('raw', seed, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('unsaid-seed-v1'), info: te.encode(info) }, k, nBytes * 8));
}
/** Deterministic P-256 key pair from the seed. The private half is imported as NON-extractable. */
export async function pairFromSeed(seed, info) {
  const d = bigTo32(bytesToBig(await hkdfBits(seed, info, 48)) % (P256_N - 1n) + 1n);   // 1 … n-1, negligible bias
  const pub = pubFromScalar(d);                                                       // 65 bytes: 04 | x | y
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: b64u(d), ext: false };
  const priv = await subtle().importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { priv, pub: b64u(pub) };
}
export const prekeyPair = (seed, idx) => pairFromSeed(seed, 'unsaid-prekey-' + idx);
export const convPairFromSeed = (seed, convId) => pairFromSeed(seed, 'unsaid-conv-' + convId);
/** Public halves of pre-made keys idx .. idx+count-1, ready to upload. */
export async function prekeyBatch(seed, from, count) {
  const out = []; for (let i = from; i < from + count; i++) out.push({ idx: i, pub: (await prekeyPair(seed, i)).pub }); return out;
}

// ── backup: seed encrypted with a passphrase / recovery code (PBKDF2 → AES-GCM) ──
export const BACKUP_ITERS = 600000;
const AAD_SEED = te.encode('unsaid-seed-backup-v1');
async function wrapKey(secret, salt, iters) {
  const base = await subtle().importKey('raw', te.encode(String(secret).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function wrapSeed(seed, secret, iters = BACKUP_ITERS) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16)), iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: AAD_SEED }, await wrapKey(secret, salt, iters), seed));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return { salt: b64u(salt), iters, blob: b64u(out) };
}
/** The seed, or null if the passphrase/recovery code is wrong. */
export async function unwrapSeed(secret, { salt, iters, blob }) {
  try {
    const raw = unb64u(blob);
    const seed = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: AAD_SEED }, await wrapKey(secret, unb64u(salt), iters), raw.slice(12)));
    return seed.length === 32 ? seed : null;
  } catch { return null; }
}
const RC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
/** 24 random characters (≈120 bits) shown as 6 groups of 4. */
export function newRecoveryCode() {
  const r = globalThis.crypto.getRandomValues(new Uint8Array(24)); let s = '';
  r.forEach((b) => { s += RC_ALPHABET[b & 31]; });
  return s.match(/.{4}/g).join('-');
}
export const cleanRecoveryCode = (s) => String(s).toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/(.{4})(?=.)/g, '$1-');

// ── voice notes: encrypted bytes ─────────────────────────────
// File = IV(12) + AES-GCM( [4-byte header length][JSON header {t: mime, ms: milliseconds}][audio bytes] ).
// The mime type and length are inside the encryption, so the server learns only the file size.
export async function encryptBytes(key, convId, aliasId, audio, meta) {
  const head = te.encode(JSON.stringify(meta)); const pt = new Uint8Array(4 + head.length + audio.length);
  new DataView(pt.buffer).setUint32(0, head.length); pt.set(head, 4); pt.set(audio, 4 + head.length);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(convId, aliasId + ':voice') }, key, pt));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
}
export async function decryptBytes(key, convId, aliasId, data) {
  try {
    const raw = new Uint8Array(data); if (raw.length < 40) return null;
    const pt = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: aad(convId, aliasId + ':voice') }, key, raw.slice(12)));
    const n = new DataView(pt.buffer).getUint32(0); if (n > 512 || 4 + n > pt.length) return null;
    return { meta: JSON.parse(td.decode(pt.slice(4, 4 + n))), bytes: pt.slice(4 + n) };
  } catch { return null; }
}

// ── on-device storage (IndexedDB): chat keys from before the seed, and the seed itself ──
const DB = 'unsaid-e2e', STORE = 'convkeys', SEEDS = 'seed';
function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => { for (const n of [STORE, SEEDS]) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
const tx = (db, store, mode, fn) => new Promise((resolve, reject) => { const t = db.transaction(store, mode); const req = fn(t.objectStore(store)); t.oncomplete = () => resolve(req?.result); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error); });
const kid = (uid, conv) => uid + ':' + conv;
export async function getStoredKey(uid, conv) { try { return (await tx(await openDb(), STORE, 'readonly', (s) => s.get(kid(uid, conv)))) || null; } catch { return null; } }
/** Saves the pair unless one is already there (two tabs can't overwrite each other). Returns the pair that is stored. */
export async function storeKeyIfAbsent(uid, conv, rec) {
  const db = await openDb();
  const existing = await tx(db, STORE, 'readonly', (s) => s.get(kid(uid, conv)));
  if (existing) return existing;
  await tx(db, STORE, 'readwrite', (s) => s.add(rec, kid(uid, conv)));
  return rec;
}
export async function replaceStoredKey(uid, conv, rec) { await tx(await openDb(), STORE, 'readwrite', (s) => s.put(rec, kid(uid, conv))); return rec; }
export async function getSeed(uid) { try { return (await tx(await openDb(), SEEDS, 'readonly', (s) => s.get(uid))) || null; } catch { return null; } }
/** Stores the seed unless one exists (returns whichever is stored, so two tabs agree). */
export async function saveSeedIfAbsent(uid, seed) {
  const db = await openDb(); const ex = await tx(db, SEEDS, 'readonly', (s) => s.get(uid)); if (ex) return ex;
  await tx(db, SEEDS, 'readwrite', (s) => s.add(seed, uid)); return seed;
}
export async function replaceSeed(uid, seed) { await tx(await openDb(), SEEDS, 'readwrite', (s) => s.put(seed, uid)); return seed; }
export async function storageAvailable() { try { await openDb(); return true; } catch { return false; } }
