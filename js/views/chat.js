// Shared chat engine for group conversations and private (anonymous) conversations.
// The page supplies an adapter (fetch / send / react / …); this file renders and keeps it live.
import { h, $, clear, icon, avatar, ago, clock, dayLabel, toastError, toast, actionSheet, confirmDialog, emojiPicker,
         QUICK_REACTIONS, modal, lightbox, copyText, debounce, empty } from '../ui.js';
import { prepareImage, uploadChatImage, chatImageUrls } from '../images.js';
import { openPollCreator } from './poll.js';

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
function linkify(text) {
  return text.split(URL_RE).map((part, i) => i % 2 ? h('a', { href: part, target: '_blank', rel: 'noopener noreferrer nofollow' }, part) : part);
}

export function createChat(opts) {
  const { kind, id, adapter, header, canPost = true, lockedText, lockedAction, caps = {}, onProfile, onReport, onBlock, focusId, noImages = false, maxLen = 4000, placeholder, voice = null } = opts;
  const isGroup = kind === 'group';
  let msgs = [];                    // ordered ascending
  let replyTo = null, attach = null, announceMode = false, hasMore = true, loadingOlder = false, destroyed = false, searchMode = false;
  let pinned = [], pinIdx = 0;
  let rec = null, recording = false, uploading = false, timerEl = null;   // voice note recording state
  const audios = new Map();                                                  // message id → { audio } so playback survives re-renders
  const sender = (m) => m.identity_id || m.alias_id;

  // ── skeleton ────────────────────────────────────────────────
  const list = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' });
  const pinbar = h('div', { class: 'pinbar hidden', onclick: () => cyclePin() });
  const searchPanel = h('div', { class: 'searchbar hidden' });
  const searchInput = h('input', { class: 'input', type: 'search', placeholder: 'Search this conversation…', 'aria-label': 'Search messages' });
  const searchResults = h('div', { class: 'msgs hidden' });
  const composerWrap = h('div', { class: 'composer-wrap' });
  const el = h('div', { class: 'chat' }, header, pinbar, searchPanel, list, searchResults, composerWrap);

  // ── data ────────────────────────────────────────────────────
  const upsert = (rows) => {
    const byId = new Map(msgs.map((m) => [m.id, m]));
    rows.forEach((r) => byId.set(r.id, r));
    msgs = [...byId.values()].sort((a, b) => a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1);
  };
  async function loadInitial() {
    clear(list).append(h('div', { class: 'loading' }, h('span', { class: 'spin' })));
    try {
      const rows = await adapter.fetch({ limit: 50 });
      msgs = []; upsert(rows); hasMore = rows.length >= 50;
      render(true); adapter.markRead?.();
      if (isGroup) loadPins();
      if (focusId) setTimeout(() => focusMessage(focusId), 60);
    } catch (e) { clear(list).append(empty('alert', 'Couldn’t load messages', e.message, h('button', { class: 'btn', onclick: loadInitial }, 'Try again'))); }
  }
  async function loadOlder() {
    if (loadingOlder || !hasMore || !msgs.length) return; loadingOlder = true;
    try {
      const prevH = list.scrollHeight;
      const rows = await adapter.fetch({ before: msgs[0].created_at, limit: 50 });
      hasMore = rows.length >= 50; upsert(rows); render(false); list.scrollTop = list.scrollHeight - prevH;
    } catch (e) { toastError(e); } finally { loadingOlder = false; }
  }
  const pending = new Set();
  const flush = debounce(async () => {
    const ids = [...pending]; pending.clear(); if (!ids.length || destroyed) return;
    try { const rows = await adapter.fetch({ ids }); if (rows.length) { upsert(rows); render(); if (rows.some((r) => !r.is_mine)) adapter.markRead?.(); } if (isGroup) loadPins(); } catch { /* next poll will reconcile */ }
  }, 150);
  const touch = (mid) => { pending.add(mid); flush(); };
  async function reconcile() {
    if (destroyed || document.hidden || searchMode) return;
    try { const rows = await adapter.fetch({ limit: 50 }); if (rows.length) { upsert(rows); render(); } } catch { /* offline */ }
  }
  async function loadPins() {
    try { pinned = await adapter.pins(); } catch { pinned = []; }
    pinIdx = Math.min(pinIdx, Math.max(0, pinned.length - 1));
    renderPins();
  }

  // ── rendering ───────────────────────────────────────────────
  function renderPins() {
    pinbar.classList.toggle('hidden', !pinned.length);
    if (!pinned.length) return;
    const p = pinned[pinIdx];
    clear(pinbar).append(icon('pin', 16), h('div', { class: 'txt truncate' }, h('b', null, p.kind === 'announcement' ? 'Announcement · ' : 'Pinned · '), p.username + ': ' + (p.body || 'Photo')),
      ...(pinned.length > 1 ? [h('span', { class: 'tag' }, `${pinIdx + 1}/${pinned.length}`)] : []));
  }
  function cyclePin() { const p = pinned[pinIdx]; focusMessage(p.id); pinIdx = (pinIdx + 1) % pinned.length; renderPins(); }

  function render(forceBottom = false) {
    if (searchMode) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 140;
    const frag = document.createDocumentFragment();
    if (hasMore && msgs.length) frag.append(h('button', { class: 'btn ghost sm more-btn', onclick: loadOlder }, 'Load earlier messages'));
    if (!msgs.length) frag.append(empty(isGroup ? 'chat' : 'ghost', 'No messages yet', canPost ? 'Say something — nobody will know it’s you.' : ''));
    let prev = null;
    msgs.forEach((m) => {
      const d = new Date(m.created_at).toDateString();
      if (!prev || new Date(prev.created_at).toDateString() !== d) frag.append(h('div', { class: 'day' }, dayLabel(m.created_at)));
      const cont = prev && sender(prev) === sender(m) && new Date(prev.created_at).toDateString() === d
        && (new Date(m.created_at) - new Date(prev.created_at)) < 5 * 60000 && !prev.deleted_at && !m.deleted_at && m.kind !== 'announcement' && prev.kind !== 'announcement';
      frag.append(messageRow(m, !!cont)); prev = m;
    });
    list.replaceChildren(frag);
    if (forceBottom || nearBottom) list.scrollTop = list.scrollHeight;
    hydrateImages(list);
  }

  function messageRow(m, cont) {
    const mine = !!m.is_mine;
    const row = h('div', { class: 'msg' + (mine ? ' mine' : '') + (cont ? ' cont' : ''), dataset: { id: m.id } });
    if (!mine) row.append(h('div', { class: 'av' }, h('button', { class: 'iconbtn', style: { width: '30px', height: '30px', padding: 0 }, 'aria-label': 'View profile of ' + m.username,
      onclick: () => onProfile?.(m) }, avatar(m.avatar, m.username, 30))));
    const wrap = h('div', { class: 'bubble-wrap' });
    if (!mine && !cont) wrap.append(h('button', { class: 'sender', onclick: () => onProfile?.(m) }, m.username));
    wrap.append(bubble(m));
    if (m.reactions?.length) wrap.append(h('div', { class: 'reactions' }, m.reactions.map((r) =>
      h('button', { class: 'react' + (r.mine ? ' mine' : ''), 'aria-label': `${r.emoji} ${r.count}`, onclick: (e) => { e.stopPropagation(); doReact(m, r.emoji); } }, r.emoji, h('span', null, r.count)))));
    row.append(wrap);
    return row;
  }

  function bubble(m) {
    if (m.deleted_at) return h('div', { class: 'bubble deleted' }, m.removed_by_moderation ? 'Removed by a moderator' : 'Message deleted');
    const k = [];
    if (m.kind === 'announcement') k.push(h('div', { class: 'tagline' }, icon('megaphone', 14), 'Announcement'));
    else if (m.pinned) k.push(h('div', { class: 'tagline' }, icon('pin', 13), 'Pinned'));
    if (m.reply) k.push(h('div', { class: 'quote', onclick: (e) => { e.stopPropagation(); focusMessage(m.reply.id); } }, h('b', null, m.reply.username),
      h('span', null, m.reply.deleted ? 'Message deleted' : (m.reply.body || (m.reply.has_voice ? '🎤 Voice message' : m.reply.has_image ? '📷 Photo' : '')))));
    if (m.poll) k.push(pollView(m));
    if (m.image_path) k.push(h('img', { class: 'photo', alt: 'Shared photo', dataset: { path: m.image_path }, onclick: (e) => { e.stopPropagation(); if (e.target.src) lightbox(e.target.src); } }));
    if (m.voice_path) k.push(voicePlayer(m));
    if (m.body && !m.poll) k.push(h('div', null, linkify(m.body)));
    k.push(h('div', { class: 'meta-line' }, m.edited_at ? h('span', null, 'edited') : null, h('span', null, clock(m.created_at))));
    return h('div', { class: 'bubble' + (m.kind === 'announcement' ? ' announce' : ''), tabindex: 0, role: 'button', 'aria-label': 'Message actions',
      onclick: (e) => { if (e.target.closest('a,.opt,.quote')) return; if (getSelection()?.toString()) return; openActions(m); },
      onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openActions(m); } }, k);
  }

  const fmt = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  function voicePlayer(m) {
    const btn = h('button', { class: 'vp-btn', type: 'button', 'aria-label': 'Play voice note' }, icon('play', 18));
    const fill = h('span'); const bar = h('div', { class: 'vp-bar' }, fill); const time = h('span', { class: 'vp-time' }, '🎤 Voice note');
    const box = h('div', { class: 'vp', onclick: (e) => e.stopPropagation() }, btn, h('div', { class: 'vp-main' }, bar, time));
    const bind = (a, total) => {
      const paint = () => { fill.style.width = (a.duration && isFinite(a.duration) ? Math.min(100, a.currentTime / a.duration * 100) : (total ? a.currentTime * 1000 / total * 100 : 0)) + '%';
        time.textContent = fmt(a.paused && !a.currentTime ? total : a.currentTime * 1000) + (a.paused && !a.currentTime ? '' : ' / ' + fmt(total)); btn.replaceChildren(icon(a.paused ? 'play' : 'pause', 18)); btn.setAttribute('aria-label', a.paused ? 'Play voice note' : 'Pause voice note'); };
      a.ontimeupdate = paint; a.onplay = paint; a.onpause = paint; a.onended = () => { a.currentTime = 0; paint(); }; paint();
    };
    const have = audios.get(m.id); if (have) bind(have.audio, have.total);
    btn.onclick = async (e) => {
      e.stopPropagation();
      try {
        let h0 = audios.get(m.id);
        if (!h0) {
          btn.disabled = true; time.textContent = 'Opening…';
          const v = await voice?.load(m);
          if (!v) { time.textContent = '🔒 Can’t be opened on this device'; return; }
          h0 = { audio: new Audio(v.url), total: v.ms }; audios.set(m.id, h0); bind(h0.audio, v.ms);
        }
        const a = h0.audio;
        if (a.paused) { audios.forEach((x) => { if (x.audio !== a) x.audio.pause(); }); await a.play(); } else a.pause();
      } catch (er) { time.textContent = '🎤 Voice note'; toastError(er); } finally { btn.disabled = false; }
    };
    return box;
  }

  function pollView(m) {
    const p = m.poll, total = p.options.reduce((s, o) => s + o.votes, 0);
    return h('div', { class: 'poll' }, h('div', { class: 'tagline' }, icon('poll', 14), p.closed ? 'Poll · closed' : 'Poll'), h('h4', null, p.question),
      p.options.map((o) => h('button', { class: 'opt' + (o.mine ? ' mine' : ''), disabled: p.closed, 'aria-pressed': String(o.mine),
        onclick: async (e) => { e.stopPropagation(); try { m.poll = await adapter.vote(p.id, o.id); render(); } catch (er) { toastError(er); } } },
        h('span', { class: 'bar', style: { width: (total ? Math.round(o.votes * 100 / total) : 0) + '%' } }),
        h('span', { class: 'lbl' }, h('span', null, (o.mine ? '✓ ' : '') + o.label), h('span', null, total ? Math.round(o.votes * 100 / total) + '%' : '0%')))),
      h('div', { class: 'small', style: { opacity: .7 } }, `${p.voters} ${p.voters === 1 ? 'vote' : 'votes'} · anonymous ballot`));
  }

  async function hydrateImages(root) {
    const imgs = [...root.querySelectorAll('img.photo[data-path]')].filter((i) => !i.src);
    if (!imgs.length) return;
    const urls = await chatImageUrls(imgs.map((i) => i.dataset.path));
    imgs.forEach((i) => { const u = urls[i.dataset.path]; if (u) i.src = u; else i.alt = 'Image unavailable'; });
  }

  // ── actions ─────────────────────────────────────────────────
  async function doReact(m, emoji) { try { await adapter.react(m.id, emoji); touch(m.id); } catch (e) { toastError(e); } }
  function openActions(m) {
    const staff = caps.staff;
    const bar = h('div', { class: 'reactbar' }, QUICK_REACTIONS.map((e) => h('button', { 'aria-label': 'React ' + e, onclick: () => { o.close(); doReact(m, e); } }, e)),
      h('button', { 'aria-label': 'More reactions', onclick: () => { o.close(); const pk = modal({ title: 'React', body: emojiPicker((e) => { pk.close(); doReact(m, e); }, { custom: true }) }); } }, icon('plus', 20)));
    const items = [
      m.deleted_at ? null : { label: 'Reply', icon: 'reply', onClick: () => setReply(m) },
      m.body ? { label: 'Copy text', icon: 'copy', onClick: () => copyText(m.body) } : null,
      (isGroup && m.is_mine && !m.deleted_at && m.kind === 'message' && m.body != null) ? { label: 'Edit', icon: 'edit', onClick: () => editMessage(m) } : null,
      (isGroup && staff && !m.deleted_at && m.kind !== 'poll') ? { label: m.pinned ? 'Unpin' : 'Pin to top', icon: 'pin', onClick: async () => { try { await adapter.pin(m.id, !m.pinned); touch(m.id); } catch (e) { toastError(e); } } } : null,
      (!m.is_mine && onProfile) ? { label: 'View profile', icon: 'user', onClick: () => onProfile(m) } : null,
      (!m.deleted_at && (m.is_mine || (staff && isGroup))) ? { label: m.is_mine ? 'Delete' : 'Delete (moderator)', icon: 'trash', danger: true, onClick: () => deleteMessage(m) } : null,
      (!m.is_mine && !m.deleted_at) ? { label: 'Report message', icon: 'flag', danger: true, onClick: () => onReport?.(m) } : null,
      (!m.is_mine && onBlock) ? { label: 'Block ' + m.username, icon: 'ban', danger: true, onClick: () => onBlock(m) } : null,
    ];
    const o = actionSheet(m.deleted_at ? items.filter((x) => x && x.label !== 'Reply') : items, m.deleted_at ? null : bar);
  }
  async function deleteMessage(m) {
    if (!await confirmDialog({ title: 'Delete this message?', message: m.is_mine ? 'This removes it for everyone.' : 'This removes the message for everyone in the group.', confirmText: 'Delete', danger: true })) return;
    try { await adapter.del(m.id); touch(m.id); toast('Message deleted', 'success', 1800); } catch (e) { toastError(e); }
  }
  function editMessage(m) {
    const ta = h('textarea', { class: 'textarea', maxlength: 4000 }); ta.value = m.body || '';
    const mm = modal({ title: 'Edit message', body: ta, actions: [h('button', { class: 'btn ghost', onclick: () => mm.close() }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: async () => { try { await adapter.edit(m.id, ta.value); mm.close(); touch(m.id); } catch (e) { toastError(e); } } }, 'Save')] });
  }
  function setReply(m) { replyTo = m; announceMode = false; renderComposer(); $('textarea', composerWrap)?.focus(); }

  async function focusMessage(mid, tries = 0) {
    if (searchMode) closeSearch();
    let node = list.querySelector(`[data-id="${CSS.escape(mid)}"] .bubble`);
    if (!node && hasMore && tries < 6) { await loadOlder(); return focusMessage(mid, tries + 1); }
    if (!node) { toast('That message is no longer available.', 'info'); return; }
    node.scrollIntoView({ block: 'center', behavior: 'smooth' }); node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash');
  }

  // ── search (group) ──────────────────────────────────────────
  function openSearch() {
    searchMode = true; searchPanel.classList.remove('hidden'); list.classList.add('hidden'); searchResults.classList.remove('hidden');
    clear(searchPanel).append(searchInput, h('button', { class: 'btn ghost sm', onclick: closeSearch }, 'Close'));
    clear(searchResults).append(h('p', { class: 'muted small', style: { padding: '12px' } }, 'Type to search messages in this conversation.')); searchInput.focus();
  }
  function closeSearch() { searchMode = false; searchPanel.classList.add('hidden'); searchResults.classList.add('hidden'); list.classList.remove('hidden'); searchInput.value = ''; render(); }
  searchInput.addEventListener('input', debounce(async () => {
    const q = searchInput.value.trim(); if (q.length < 2) return;
    try {
      const rows = await adapter.fetch({ search: q, limit: 60 });
      clear(searchResults).append(...(rows.length ? rows.reverse().map((m) => h('button', { class: 'item', onclick: async () => { closeSearch(); upsert(rows); await focusMessage(m.id); } },
        avatar(m.avatar, m.username, 32), h('div', { class: 'grow' }, h('div', { class: 'title small' }, m.username, h('span', { class: 'faint' }, ' · ' + ago(m.created_at))), h('div', { class: 'sub truncate' }, m.body))))
        : [empty('search', 'No matches', 'Try a different word.')]));
    } catch (e) { toastError(e); }
  }, 350));

  // ── composer ────────────────────────────────────────────────
  let ta, sendBtn, emojiBox;
  let pendingDraft = String(opts.draft || '');   // optional prefilled text (e.g. from a Home prompt)
  async function pickImage() {
    const inp = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    inp.onchange = async () => { try { attach = await prepareImage(inp.files[0]); renderComposer(); } catch (e) { toastError(e); } };
    inp.click();
  }
  async function submit() {
    const body = ta.value.trim();
    if (!body && !attach) return;
    sendBtn.disabled = true;
    try {
      let path = null;
      if (attach) path = await uploadChatImage(isGroup ? 'g' : 'd', id, attach);
      const mid = await adapter.send({ body, image: path, reply: replyTo?.id || null, kind: announceMode ? 'announcement' : 'message' });
      ta.value = ''; ta.style.height = ''; replyTo = null; attach = null; announceMode = false;
      renderComposer(); touch(mid); setTimeout(() => { list.scrollTop = list.scrollHeight; }, 250);
    } catch (e) { toastError(e); sendBtn.disabled = false; }
  }
  // ── voice notes ──
  async function startRec() {
    let warned = false; try { warned = localStorage.getItem('unsaid.voicewarn') === '1'; } catch { /* ignore */ }
    if (!warned) {
      if (!await confirmDialog({ title: 'Before you record', message: 'Voice notes are encrypted on your device before they’re uploaded, but your voice can reveal who you are. Only send them to people you trust. Your browser will ask to use the microphone.', confirmText: 'Start recording' })) return;
      try { localStorage.setItem('unsaid.voicewarn', '1'); } catch { /* ignore */ }
    }
    try {
      rec = await voice.record({ onTick: (ms) => { if (timerEl) timerEl.textContent = fmt(ms) + ' / 1:00'; }, onLimit: () => finishRec(true) });
      recording = true; renderComposer();
    } catch (e) { rec = null; toast(/denied|permission|NotAllowed/i.test(e?.name + ' ' + e?.message) ? 'Microphone access was blocked. Allow it in your browser’s site settings to send voice notes.' : 'Couldn’t start the microphone.', 'error', 6000); }
  }
  async function finishRec(send) {
    const r = rec; if (!r) return; rec = null; recording = false;
    if (!send) { await r.cancel().catch(() => {}); renderComposer(); return; }
    uploading = true; renderComposer();
    try {
      const data = await r.stop();
      if (!data) { uploading = false; renderComposer(); toast('That was too short. Hold on a little longer.', 'info'); return; }
      const mid = await voice.send(data, replyTo?.id || null);
      replyTo = null; uploading = false; renderComposer(); touch(mid); setTimeout(() => { list.scrollTop = list.scrollHeight; }, 250);
    } catch (e) { uploading = false; renderComposer(); toastError(e); }
  }
  function micClick() {
    if (!voice.supported) { toast('Your browser can’t record audio here.', 'info'); return; }
    const st = voice.state();
    if (st === 'on') startRec();
    else if (st === 'requested') toast(voice.byMe() ? 'Waiting for ' + voice.other + ' to accept your voice note request.' : 'Accept or decline the request above first.', 'info', 3500);
    else voice.request();
  }
  function renderComposer() {
    const keep = ta ? ta.value : pendingDraft;
    pendingDraft = '';
    clear(composerWrap);
    if (!canPost) { composerWrap.append(h('div', { class: 'locked-note', style: { margin: '-8px -10px' } }, lockedText || 'You can’t post here.', lockedAction ? h('div', { class: 'row', style: { marginTop: '8px', justifyContent: 'center', flexWrap: 'wrap', gap: '8px' } }, [].concat(lockedAction).map((a) => h('button', { class: 'btn sm', onclick: a.onClick }, a.label))) : null)); return; }
    if (recording || uploading) {
      timerEl = h('span', { class: 'mono' }, '0:00 / 1:00');
      composerWrap.append(h('div', { class: 'recbar' }, uploading ? h('span', { class: 'spin' }) : h('span', { class: 'recdot' }),
        h('div', { class: 'grow' }, uploading ? 'Encrypting and sending…' : ['Recording ', timerEl]),
        uploading ? null : h('button', { class: 'iconbtn', 'aria-label': 'Discard recording', onclick: () => finishRec(false) }, icon('trash', 20)),
        uploading ? null : h('button', { class: 'sendbtn', 'aria-label': 'Send voice note', onclick: () => finishRec(true) }, icon('send', 19))));
      return;
    }
    if (voice && voice.state() === 'requested' && !voice.byMe()) composerWrap.append(h('div', { class: 'voicereq' }, h('div', { class: 'grow' }, '🎤 ', h('b', { class: 'mono' }, voice.other), ' would like to send voice notes in this chat.'),
      h('button', { class: 'btn sm', onclick: () => voice.respond(false) }, 'Decline'), h('button', { class: 'btn sm primary', onclick: () => voice.respond(true) }, 'Accept')));
    if (replyTo) composerWrap.append(h('div', { class: 'replying' }, icon('reply', 16), h('div', { class: 'grow truncate' }, h('b', null, replyTo.username), ' ' + (replyTo.body || (replyTo.voice_path ? '🎤 Voice message' : '📷 Photo'))),
      h('button', { class: 'iconbtn', 'aria-label': 'Cancel reply', onclick: () => { replyTo = null; renderComposer(); } }, icon('x', 16))));
    if (announceMode) composerWrap.append(h('div', { class: 'replying' }, icon('megaphone', 16), h('div', { class: 'grow' }, 'Posting as an announcement to everyone'),
      h('button', { class: 'iconbtn', 'aria-label': 'Cancel announcement', onclick: () => { announceMode = false; renderComposer(); } }, icon('x', 16))));
    if (attach) composerWrap.append(h('div', { class: 'attach-preview' }, h('img', { src: attach.url, alt: 'Selected image preview' }),
      h('button', { class: 'btn icon sm', 'aria-label': 'Remove image', onclick: () => { attach = null; renderComposer(); } }, icon('x', 14))));
    emojiBox = h('div', { class: 'hidden', style: { marginBottom: '8px' } }, emojiPicker((e) => { ta.setRangeText(e, ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); }));
    ta = h('textarea', { rows: 1, placeholder: announceMode ? 'Write an announcement…' : (placeholder || (isGroup ? 'Message the group…' : 'Write a message…')), maxlength: maxLen, 'aria-label': 'Message' });
    ta.value = keep;
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover)').matches) { e.preventDefault(); submit(); } });
    sendBtn = h('button', { class: 'sendbtn', 'aria-label': 'Send message', onclick: submit }, icon('send', 19));
    const extras = [];
    if (isGroup && (caps.poll || caps.announce)) extras.push(h('button', { class: 'iconbtn', 'aria-label': 'More message types', onclick: () => actionSheet([
      caps.poll ? { label: 'Create a poll', icon: 'poll', onClick: () => openPollCreator(async (v) => { await adapter.createPoll(v); reconcile(); }) } : null,
      caps.announce ? { label: 'Post an announcement', icon: 'megaphone', onClick: () => { announceMode = true; replyTo = null; renderComposer(); $('textarea', composerWrap)?.focus(); } } : null]) }, icon('plus', 22)));
    composerWrap.append(emojiBox, h('div', { class: 'composer' }, ...extras,
      noImages ? null : h('button', { class: 'iconbtn', 'aria-label': 'Add photo', onclick: pickImage }, icon('image', 22)),
      voice ? h('button', { class: 'iconbtn', 'aria-label': voice.state() === 'on' ? 'Record a voice note' : 'Voice notes', onclick: micClick }, icon('mic', 22)) : null,
      h('button', { class: 'iconbtn', 'aria-label': 'Emoji', onclick: () => emojiBox.classList.toggle('hidden') }, icon('smile', 22)), ta, sendBtn));
    if (keep) ta.dispatchEvent(new Event('input'));
  }

  // ── lifecycle ───────────────────────────────────────────────
  renderComposer(); loadInitial();
  let live = false;
  const stopWatch = adapter.watch({ onMessage: touch, onReaction: touch, onStatus: (s) => { live = s === 'SUBSCRIBED'; } });
  const poll = setInterval(reconcile, 12000);
  const vis = () => { if (!document.hidden) reconcile(); };
  document.addEventListener('visibilitychange', vis);
  return {
    el, openSearch, focusMessage, reload: loadInitial, isLive: () => live, isRecording: () => recording || uploading,
    destroy() { destroyed = true; if (rec) { rec.cancel().catch(() => {}); rec = null; } audios.forEach((x) => x.audio.pause()); clearInterval(poll); document.removeEventListener('visibilitychange', vis); stopWatch?.(); },
  };
}
