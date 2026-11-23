// DOM + UI helpers. Everything user-supplied is inserted as text (never innerHTML).
import { iconSvg } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const icon = iconSvg;

/** h('div', {class:'x', onclick}, 'text', childEl, [more]) */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required' || k === 'multiple') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...kids) => append(clear(el), kids);

// ── errors ───────────────────────────────────────────────────
export function errMsg(e) {
  if (!e) return 'Something went wrong.';
  let m = typeof e === 'string' ? e : (e.message || e.error_description || e.msg || 'Something went wrong.');
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) m = 'Network problem. Check your connection and try again.';
  if (/JWT expired/i.test(m)) m = 'Your session expired. Please sign in again.';
  if (/rate limit|too many/i.test(m) && !/Slow down/i.test(m)) m = m.replace(/^.*$/s, (s) => s);
  return m;
}

// ── toast ────────────────────────────────────────────────────
export function toast(msg, type = 'info', ms = 3800) {
  let box = $('#toasts');
  if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast ${type}` }, msg);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}
export const toastError = (e) => toast(errMsg(e), 'error', 5200);

// ── modal / confirm / action sheet ───────────────────────────
function overlay(content, { sheet = false, onClose } = {}) {
  const prev = document.activeElement;
  const wrap = h('div', { class: 'overlay' + (sheet ? ' sheet-wrap' : ''), role: 'dialog', 'aria-modal': 'true' }, content);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose?.(); prev?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  const f = wrap.querySelector('input,textarea,select,button.primary,button');
  f?.focus?.({ preventScroll: true });
  return { close, el: wrap };
}
export function modal({ title, body, actions = [], wide = false }) {
  const box = h('div', { class: 'modal' + (wide ? ' wide' : '') },
    title && h('h2', null, title), body,
    actions.length ? h('div', { class: 'actions' }, actions) : null);
  return overlay(box);
}
export function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false, cancelText = 'Cancel' }) {
  return new Promise((resolve) => {
    let m;
    const done = (v) => { m.close(); resolve(v); };
    m = modal({
      title, body: h('p', { class: 'muted' }, message),
      actions: [h('button', { class: 'btn ghost', onclick: () => done(false) }, cancelText),
                h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => done(true) }, confirmText)],
    });
    m.el.addEventListener('mousedown', (e) => { if (e.target === m.el) resolve(false); });
  });
}
/** items: [{label, icon, danger, onClick}] */
export function actionSheet(items, header) {
  let o;
  const list = h('div', { class: 'list' }, items.filter(Boolean).map((it) =>
    h('button', { class: 'item' + (it.danger ? ' danger' : ''), onclick: () => { o.close(); it.onClick?.(); } },
      it.icon && icon(it.icon, 20), h('span', { class: 'grow' }, it.label))));
  o = overlay(h('div', { class: 'sheet' }, h('div', { class: 'sheet-grab' }), header, list), { sheet: true });
  return o;
}
export function promptDialog({ title, label, placeholder = '', confirmText = 'Save', multiline = false, required = true, value = '' }) {
  return new Promise((resolve) => {
    const input = h(multiline ? 'textarea' : 'input', { class: multiline ? 'textarea' : 'input', placeholder, value, maxlength: 2000 });
    let m; const done = (v) => { m.close(); resolve(v); };
    const submit = () => { const v = input.value.trim(); if (required && !v) { input.focus(); return; } done(v); };
    if (!multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    m = modal({ title, body: h('div', { class: 'field' }, label && h('label', null, label), input),
      actions: [h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Cancel'), h('button', { class: 'btn primary', onclick: submit }, confirmText)] });
    m.el.addEventListener('mousedown', (e) => { if (e.target === m.el) resolve(null); });
  });
}

// ── busy buttons ─────────────────────────────────────────────
export async function withBusy(btn, fn) {
  if (btn.disabled) return;
  const kids = [...btn.childNodes]; btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin' }));
  try { return await fn(); }
  catch (e) { toastError(e); }
  finally { btn.disabled = false; btn.replaceChildren(...kids); }
}

// ── states ───────────────────────────────────────────────────
export const loading = (text) => h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spin' }), text ? h('span', { class: 'sr-only' }, text) : null);
export function empty(ico, title, text, action) {
  return h('div', { class: 'empty' }, h('div', { class: 'ico' }, icon(ico, 26)), h('h3', null, title), text && h('p', null, text), action);
}
export const skeletons = (n = 3, hgt = 66) => h('div', { class: 'stack' }, Array.from({ length: n }, () => h('div', { class: 'skel', style: { height: hgt + 'px' } })));
export function errorState(e, retry) {
  return h('div', { class: 'empty' }, h('div', { class: 'ico', style: { color: 'var(--danger)', background: 'var(--danger-soft)' } }, icon('alert', 26)),
    h('h3', null, 'Couldn’t load this'), h('p', null, errMsg(e)), retry && h('button', { class: 'btn', onclick: retry }, 'Try again'));
}

// ── avatars (12 anonymous presets; no photos, so nothing can identify you) ──
const AV = [
  ['#7b6be0', '#b3a7f7', 'ghost'], ['#3b6fb6', '#7fb2f0', 'star'], ['#2f8f83', '#7fd3c0', 'shield'], ['#a05cc2', '#d8a6f0', 'globe'],
  ['#c0587a', '#f0a3bb', 'compass'], ['#5a63d8', '#a3a9f7', 'chat'], ['#3a8a5e', '#9be0b8', 'pin'], ['#b0773a', '#f0c48a', 'megaphone'],
  ['#4a5a8c', '#9aaad8', 'lock'], ['#8a4fb8', '#c9a0f0', 'eye'], ['#2f7fa0', '#8bd0ea', 'mail'], ['#b05a5a', '#efa8a8', 'poll'],
];
export const AVATAR_COUNT = AV.length;
export function avatar(idx, name = '', size = 36) {
  let i = Number.isInteger(idx) ? idx : (parseInt(String(name).replace(/\D/g, '').slice(-3) || '0', 10) % AV.length);
  const [a, b, ic] = AV[((i % AV.length) + AV.length) % AV.length];
  return h('span', { class: 'avatar', style: { width: size + 'px', height: size + 'px', background: `linear-gradient(135deg, ${a}, ${b})` }, 'aria-hidden': 'true' }, icon(ic, size * .5));
}
export function groupAvatar(url, name = '', size = 44) {
  if (url) return h('span', { class: 'avatar square', style: { width: size + 'px', height: size + 'px' } }, h('img', { src: url, alt: '', loading: 'lazy' }));
  const hue = [...name].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 360, 7);
  return h('span', { class: 'avatar square', style: { width: size + 'px', height: size + 'px', background: `linear-gradient(135deg, hsl(${hue} 45% 38%), hsl(${(hue + 40) % 360} 55% 62%))`, fontWeight: 700, fontSize: size * .42 + 'px' }, 'aria-hidden': 'true' }, (name[0] || '?').toUpperCase());
}
export function avatarPicker(current, onPick) {
  const wrap = h('div', { class: 'avatar-picker', role: 'radiogroup', 'aria-label': 'Choose an avatar' });
  AV.forEach((_, i) => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(i === current), class: i === current ? 'on' : '', 'aria-label': 'Avatar ' + (i + 1),
      onclick: () => { $$('button', wrap).forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); }); b.classList.add('on'); b.setAttribute('aria-checked', 'true'); onPick(i); } }, avatar(i, '', 46));
    wrap.append(b);
  });
  return wrap;
}

// ── time ─────────────────────────────────────────────────────
export function ago(ts) {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 45) return 'now'; if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h'; if (s < 604800) return Math.round(s / 86400) + 'd';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export const clock = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const dateTime = (ts) => ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export function dayLabel(ts) {
  const d = new Date(ts), t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}

// ── misc ─────────────────────────────────────────────────────
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard', 'success', 1800); return true; }
  catch { const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }, text); document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied to clipboard', 'success', 1800); } catch { toast('Copy failed', 'error'); } ta.remove(); }
}
export const CATEGORIES = [
  ['education', 'Education'], ['technology', 'Technology'], ['relationships', 'Relationships'], ['entertainment', 'Entertainment'],
  ['career', 'Career & business'], ['lifestyle', 'Lifestyle'], ['personal', 'Personal experiences'], ['confessions', 'Confessions'],
  ['general', 'General discussions'], ['health', 'Health & wellbeing'], ['other', 'Other interests'],
];
export const categoryLabel = (c) => (CATEGORIES.find((x) => x[0] === c) || [, c])[1];
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const rng = (a, b, skip = []) => { const o = []; for (let c = a; c <= b; c++) if (!skip.includes(c)) o.push(String.fromCodePoint(c)); return o; };
const strs = (t) => t.split(/\s+/).filter(Boolean);
export const EMOJI_GROUPS = [
  ['😀', 'Faces', [...rng(0x1F600, 0x1F637), ...rng(0x1F641, 0x1F644), ...rng(0x1F910, 0x1F915), '🤗', ...rng(0x1F920, 0x1F925), ...rng(0x1F927, 0x1F92F), '🥰', '🥳', '🥴', '🥵', '🥶', '🥺', '🧐', '🫠', '🫡', '🫣', '🫢', '🥹', '🫥']],
  ['👍', 'People', strs('👋 🤚 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 👀 👁️ 👅 👄 🧠 🫶 🫂 🙋 🙆 🙅 🤷 🤦 💃 🕺 🚶 🏃 👶 🧒 👧 👦 👩 👨 🧓 👵 👴')],
  ['❤️', 'Hearts', strs('❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ❤️‍🔥 💋 💯 💢 💥 💫 💦 💤 💬 💭 🗯️ ✨ ⭐ 🌟 ⚡ 🔥 🎉 🎊 🎈 🏆 👑 💎 🔔 ✅ ❌ ❓ ❗ ‼️ ⁉️ ♾️')],
  ['🐶', 'Animals', [...rng(0x1F400, 0x1F43E), ...rng(0x1F980, 0x1F991), ...strs('🌸 🌹 🌺 🌻 🌼 🌷 🌱 🌲 🌳 🌴 🍀 🍁 🍂 🍃 🌈 ☀️ 🌙 ⛅ ☁️ 🌧️ ⛈️ ❄️ ☃️ 🌊')]],
  ['🍕', 'Food', [...rng(0x1F345, 0x1F37B), ...rng(0x1F950, 0x1F96B), '☕']],
  ['⚽', 'Fun', [...rng(0x1F380, 0x1F393), ...rng(0x1F3A0, 0x1F3AF), '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎱', '🥇', '🥈', '🥉', ...rng(0x1F4DA, 0x1F4DC), '📱', '💻', '📷', '🎧', '🎤', '🎬', '💡', '🔑', '🔒', '🎁']],
  ['✈️', 'Places', [...rng(0x1F680, 0x1F6A4), ...rng(0x1F30D, 0x1F30F), '🏠', '🏫', '⛪', '🗽', '🗼', '🏝️', '🏔️', '🌋', '🌅', '🌃', '🌆']],
];
// anything that is really one emoji (including skin tones, flags and joined emoji) is accepted
const oneEmoji = (t) => {
  t = (t || '').trim(); if (!t || t.length > 16) return null;
  const seg = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)];
  return seg.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(t) ? t : null;
};
export function emojiPicker(onPick, { custom = false } = {}) {
  const grid = h('div', { class: 'emoji-grid' });
  const tabs = h('div', { class: 'emoji-tabs', role: 'tablist' });
  const show = (i) => {
    [...tabs.children].forEach((t, j) => t.classList.toggle('on', i === j));
    grid.replaceChildren(...EMOJI_GROUPS[i][2].map((e) => h('button', { type: 'button', 'aria-label': e, onclick: () => onPick(e) }, e)));
    grid.scrollTop = 0;
  };
  EMOJI_GROUPS.forEach(([ico, name], i) => tabs.append(h('button', { type: 'button', role: 'tab', 'aria-label': name, title: name, onclick: () => show(i) }, ico)));
  show(0);
  const wrap = h('div', { class: 'emoji-picker' }, tabs, grid);
  if (custom) {
    const inp = h('input', { class: 'input', placeholder: 'Or type / paste any emoji…', 'aria-label': 'Type or paste any emoji', maxlength: 16, inputmode: 'text', style: { flex: 1, minWidth: 0 } });
    const add = () => { const e = oneEmoji(inp.value); if (!e) { inp.focus(); inp.classList.add('bad'); setTimeout(() => inp.classList.remove('bad'), 700); return; } onPick(e); };
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
    wrap.append(h('div', { class: 'row', style: { marginTop: '10px' } }, inp, h('button', { type: 'button', class: 'btn primary sm', onclick: add }, 'Add')));
  }
  return wrap;
}
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export function lightbox(src) {
  const el = h('div', { class: 'lightbox', onclick: () => el.remove() }, h('img', { src, alt: 'Shared image' }));
  document.body.append(el);
}
export function setTitle(t) { document.title = t ? `${t} · UNSAID` : 'UNSAID — There’s more to say when nobody knows it’s you.'; }
