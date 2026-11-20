// Voice notes for private chats: record in the browser, encrypt with the chat key, upload the encrypted file.
// The server stores only an opaque .bin file; the mime type and length are inside the encryption.
import { sb } from './supabase.js';
import { encryptBytes, decryptBytes } from './e2ee.js';

export const MAX_MS = 60000, MIN_MS = 600, MAX_BYTES = 1900000;
export const micSupported = () => !!(navigator.mediaDevices?.getUserMedia && globalThis.MediaRecorder);
const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';

/** Asks for the microphone and starts recording. Returns { stop(), cancel() }. onTick(ms) fires about 5×/s; onLimit() at 60 s. */
export async function startRecording({ onTick, onLimit } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = pickMime();
  const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
  const chunks = []; mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const t0 = Date.now(); let done = false;
  const release = () => { clearInterval(tick); stream.getTracks().forEach((t) => t.stop()); };
  const tick = setInterval(() => { const ms = Date.now() - t0; onTick?.(ms); if (ms >= MAX_MS && !done) onLimit?.(); }, 200);
  mr.start(250);
  const finish = () => new Promise((resolve) => { done = true; mr.onstop = () => { release(); resolve(); }; if (mr.state !== 'inactive') mr.stop(); else { release(); resolve(); } });
  return {
    async stop() {
      await finish();
      const ms = Math.min(Date.now() - t0, MAX_MS), blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' });
      if (ms < MIN_MS) return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length > MAX_BYTES) throw new Error('That voice note is too large. Try a shorter one.');
      return { bytes, mime: blob.type || 'audio/webm', ms };
    },
    async cancel() { await finish(); },
  };
}

/** Encrypts and uploads; returns the storage path to hand to send_dm_voice. */
export async function uploadVoice({ conv, aes, aliasId, rec }) {
  const enc = await encryptBytes(aes, conv, aliasId, rec.bytes, { t: rec.mime, ms: rec.ms });
  const path = `d/${conv}/${crypto.randomUUID()}.bin`;
  const { error } = await sb.storage.from('dm-voice').upload(path, new Blob([enc], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream', upsert: false });
  if (error) throw new Error(/row-level|policy|not allowed/i.test(error.message) ? 'Voice notes aren’t turned on in this chat.' : error.message);
  return path;
}

const cache = new Map();
/** Downloads + decrypts one voice note. Resolves { url, ms } or null if it can't be opened on this device. */
export function loadVoice(path, aes, conv, aliasId) {
  const k = path + '|' + (aes ? 1 : 0);
  if (!cache.has(k)) cache.set(k, (async () => {
    if (!aes) return null;
    const { data, error } = await sb.storage.from('dm-voice').download(path); if (error || !data) throw new Error('Couldn’t download this voice note.');
    const dec = await decryptBytes(aes, conv, aliasId, await data.arrayBuffer()); if (!dec) return null;
    return { url: URL.createObjectURL(new Blob([dec.bytes], { type: dec.meta.t || 'audio/webm' })), ms: dec.meta.ms || 0 };
  })().catch((e) => { cache.delete(k); throw e; }));
  return cache.get(k);
}
