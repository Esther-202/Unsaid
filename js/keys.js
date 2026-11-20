// Key management for end-to-end encrypted private chats.
//   - Makes the account's master seed on first launch and keeps a stack of one-time public keys on the server,
//     so a chat can start while the other person is offline.
//   - Makes a key for every chat that has none yet (from the seed), as soon as the app opens.
//   - Backs the seed up (encrypted with a passphrase or recovery code) and restores it on a new device.
// The seed and all private keys stay on this device. The server only ever gets public keys and the encrypted backup.
import { rpc } from './supabase.js';
import { emit } from './store.js';
import { newSeed, getSeed, saveSeedIfAbsent, replaceSeed, storageAvailable, getStoredKey, pairFromSeed, prekeyPair, convPairFromSeed,
         prekeyBatch, wrapSeed, unwrapSeed, cleanRecoveryCode } from './e2ee.js';

const BATCH = 50, LOW = 20;
/** status: 'idle' | 'ready' | 'need-restore' (this device has no/old seed) | 'unavailable' (browser can't store keys) */
export const S = { status: 'idle', hasBackup: false, backupKind: null, backupAt: null, uid: null };
const notify = () => emit('keys');
let running = null;

export function initKeys(uid) {
  if (running) return running;
  if (S.uid === uid && S.status !== 'idle') return Promise.resolve(S);
  running = (async () => {
    S.uid = uid;
    if (!await storageAvailable()) { S.status = 'unavailable'; notify(); return S; }
    let ks; try { ks = await rpc('my_key_state'); } catch { return S; }       // offline: try again next time
    S.hasBackup = !!ks.has_backup; S.backupKind = ks.backup_kind || null; S.backupAt = ks.backup_at || null;
    let seed = await getSeed(uid);
    if (seed && ks.has_seed && ks.first_pub && (await prekeyPair(seed, 0)).pub !== ks.first_pub) { S.status = 'need-restore'; }   // this device's seed is not the account's current seed
    else if (seed) { await topUp(seed, ks); S.status = 'ready'; }
    else if (ks.has_seed) S.status = 'need-restore';
    else {
      seed = await saveSeedIfAbsent(uid, newSeed());
      await rpc('upload_prekeys', { p_keys: await prekeyBatch(seed, 0, BATCH), p_reset: true });
      S.status = 'ready';
    }
    if (S.status === 'ready') await ensureConvKeys(seed);
    notify(); return S;
  })().catch(() => S).finally(() => { running = null; });
  return running;
}
export const resetKeyState = () => { S.status = 'idle'; S.hasBackup = false; S.backupKind = null; S.uid = null; running = null; };

async function topUp(seed, ks) {
  const unused = ks.unused || 0;
  if (ks.has_seed && unused >= LOW) return;
  await rpc('upload_prekeys', { p_keys: await prekeyBatch(seed, ks.has_seed ? ks.next_idx : 0, BATCH), p_reset: false }).catch(() => {});
}
/** Chats with no key of mine yet (e.g. the other person started them): make one from the seed. */
async function ensureConvKeys(seed) {
  let ids = []; try { ids = await rpc('convs_needing_key'); } catch { return; }
  for (const id of ids.slice(0, 40)) {
    try { await rpc('set_dm_key', { p_conv: id, p_key: (await convPairFromSeed(seed, id)).pub }); } catch { /* next launch */ }
  }
}

/** My key pair for one chat. Returns { pair } or { pair: null, why: 'noseed' | 'mismatch' }.  Publishes a key if the chat has none. */
export async function conversationKey(uid, convId, c) {
  const legacy = await getStoredKey(uid, convId);                 // chats made before the seed existed: random key kept on this device
  if (legacy && (!c.my_key || legacy.pub === c.my_key)) {
    if (!c.my_key) { await rpc('set_dm_key', { p_conv: convId, p_key: legacy.pub }); c.my_key = legacy.pub; }
    return { pair: legacy };
  }
  const seed = await getSeed(uid);
  if (!seed || S.status !== 'ready') return { pair: null, why: 'noseed' };
  if (c.my_prekey_idx != null) { const p = await prekeyPair(seed, c.my_prekey_idx); return p.pub === c.my_key ? { pair: p } : { pair: null, why: 'mismatch' }; }
  const p = await convPairFromSeed(seed, convId);
  if (!c.my_key) { await rpc('set_dm_key', { p_conv: convId, p_key: p.pub }); c.my_key = p.pub; return { pair: p }; }
  return p.pub === c.my_key ? { pair: p } : { pair: null, why: 'mismatch' };
}

/** "Start fresh" for one chat: new key from this device's (current) seed; older messages in that chat become unreadable. */
export async function startFreshChat(uid, convId) {
  if (S.status !== 'ready') await startNewSeed(uid);
  const seed = await getSeed(uid);
  await rpc('set_dm_key', { p_conv: convId, p_key: (await convPairFromSeed(seed, convId)).pub, p_replace: true });
}

/** This device becomes the account's key holder with a brand-new seed (old backup is removed: it would restore the OLD seed). */
export async function startNewSeed(uid) {
  const seed = await replaceSeed(uid, newSeed());
  await rpc('upload_prekeys', { p_keys: await prekeyBatch(seed, 0, BATCH), p_reset: true });
  await rpc('delete_key_backup').catch(() => {});
  S.hasBackup = false; S.backupKind = null; S.status = 'ready';
  await ensureConvKeys(seed); notify();
}

// ── backup / restore ─────────────────────────────────────────
/** secret: the passphrase, or the recovery code. kind: 'passphrase' | 'recovery'. */
export async function createBackup(uid, secret, kind) {
  const seed = await getSeed(uid); if (!seed || S.status !== 'ready') throw new Error('This device has no keys to back up yet.');
  const w = await wrapSeed(seed, kind === 'recovery' ? cleanRecoveryCode(secret) : secret);
  await rpc('save_key_backup', { p_kind: kind, p_salt: w.salt, p_iters: w.iters, p_blob: w.blob });
  S.hasBackup = true; S.backupKind = kind; S.backupAt = new Date().toISOString(); notify();
}
/** Returns true on success, false when the passphrase / code is wrong. */
export async function restoreBackup(uid, secret) {
  const b = await rpc('get_key_backup'); if (!b) throw new Error('There is no backup on this account yet.');
  const seed = await unwrapSeed(b.kind === 'recovery' ? cleanRecoveryCode(secret) : secret, b);
  if (!seed) return false;
  await replaceSeed(uid, seed);
  const ks = await rpc('my_key_state');
  if (ks.first_pub && (await prekeyPair(seed, 0)).pub !== ks.first_pub) {
    // the backup is older than this account's current seed (a new seed was made later): keys would not match
    throw new Error('This backup is from an older set of keys. Start new keys instead, or restore from your newest backup.');
  }
  S.status = 'ready'; S.hasBackup = true; S.backupKind = b.kind;
  await topUp(seed, ks); await ensureConvKeys(seed); notify(); return true;
}
export async function deleteBackup() { await rpc('delete_key_backup'); S.hasBackup = false; S.backupKind = null; notify(); }
