// Image handling. Every photo is re-encoded through a canvas BEFORE upload, which
// drops all EXIF metadata (GPS, camera, timestamps) that could identify someone.
import { sb } from './supabase.js';

const OK = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IN = 15 * 1024 * 1024;

export async function prepareImage(file, { maxSide = 1600, quality = 0.86 } = {}) {
  if (!file) throw new Error('No file selected.');
  if (!OK.includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP image.');
  if (file.size > MAX_IN) throw new Error('That image is too large (15 MB max).');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('That image could not be read.'); }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  let blob = await new Promise((r) => c.toBlob(r, 'image/webp', quality));
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality)); ext = 'jpg'; }
  if (!blob) throw new Error('Image processing failed.');
  if (blob.size > 4.8 * 1024 * 1024) throw new Error('That image is still too large after compression.');
  return { blob, ext, type: blob.type, url: URL.createObjectURL(blob) };
}
const uuid = () => crypto.randomUUID();

export async function uploadChatImage(kind /* 'g' | 'd' */, scopeId, prepared) {
  const path = `${kind}/${scopeId}/${uuid()}.${prepared.ext}`;
  const { error } = await sb.storage.from('chat-images').upload(path, prepared.blob, { contentType: prepared.type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(error.message || 'Upload failed.');
  return path;
}
export async function uploadGroupImage(prepared) {
  const path = `${uuid()}.${prepared.ext}`;
  const { error } = await sb.storage.from('group-images').upload(path, prepared.blob, { contentType: prepared.type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(error.message || 'Upload failed.');
  return path;
}
export const groupImageUrl = (path) => path ? sb.storage.from('group-images').getPublicUrl(path).data.publicUrl : null;

// Chat images live in a private bucket → short-lived signed URLs (cached).
const cache = new Map();
export async function chatImageUrls(paths) {
  const need = [...new Set(paths.filter((p) => p && (!cache.has(p) || cache.get(p).exp < Date.now() + 60000)))];
  if (need.length) {
    const { data } = await sb.storage.from('chat-images').createSignedUrls(need, 3600);
    (data || []).forEach((d) => { if (d.signedUrl) cache.set(d.path, { url: d.signedUrl, exp: Date.now() + 3500000 }); });
  }
  return Object.fromEntries(paths.map((p) => [p, cache.get(p)?.url || null]));
}
