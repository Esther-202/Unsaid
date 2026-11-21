import { rpc } from '../supabase.js';
import { h, icon, ago, toastError, confirmDialog, emojiPicker, modal, toast, QUICK_REACTIONS } from '../ui.js';

export const MOODS = [['😄', 'Great'], ['🙂', 'Good'], ['😐', 'Okay'], ['😔', 'Low'], ['😢', 'Sad'], ['😠', 'Stressed']];
export const badgeFor = (n) => (n >= 30 ? '🏆' : n >= 7 ? '⭐' : n >= 3 ? '✨' : '');

// A soft, anonymous colour per post (from its random id): no names, no faces.
const hue = (seed) => parseInt(seed || '0', 16) % 360;

// one answer or letter; kind = 'answer' | 'letter'; mainLabel = "Me too" / "I felt this"
export function postCard(p, kind, mainLabel, { onGone } = {}) {
  const box = h('article', { class: 'dpost ' + kind, style: { '--h': hue(p.seed) } });
  const bar = h('div', { class: 'dbar' });
  const apply = (res) => { Object.assign(p, res); draw(); };
  const act = async (emoji) => {
    try { await rpc('react_daily', { p_kind: kind, p_id: p.id, p_emoji: emoji }); } catch (e) { toastError(e); return; }
    if (emoji === 'main') { p.main_mine = !p.main_mine; p.main_count += p.main_mine ? 1 : -1; }
    else {
      const r = (p.reactions || []).find((x) => x.emoji === emoji);
      if (r && r.mine) { r.mine = false; r.count -= 1; if (r.count <= 0) p.reactions = p.reactions.filter((x) => x !== r); }
      else if (r) { r.mine = true; r.count += 1; } else p.reactions = [...(p.reactions || []), { emoji, count: 1, mine: true }];
    }
    draw();
  };
  const pick = () => {
    const m = modal({ title: 'React with anything', body: h('div', null,
      h('div', { class: 'qr' }, QUICK_REACTIONS.map((e) => h('button', { type: 'button', class: 'btn ghost', onclick: () => { m.close(); act(e); } }, e))),
      emojiPicker((e) => { m.close(); act(e); })), actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Close')] });
  };
  function draw() {
    bar.replaceChildren(...[
      p.is_mine ? h('span', { class: 'chip mine' }, `${p.main_count} ${mainLabel.toLowerCase()}`)
        : h('button', { class: 'btn sm main' + (p.main_mine ? ' on' : ''), 'aria-pressed': String(!!p.main_mine), onclick: () => act('main') }, `${p.main_mine ? '✓ ' : ''}${mainLabel}`, p.main_count ? h('span', { class: 'n' }, String(p.main_count)) : null),
      ...(p.reactions || []).map((r) => h('button', { class: 'rx' + (r.mine ? ' on' : ''), 'aria-label': `${r.emoji} ${r.count}`, onclick: () => act(r.emoji) }, r.emoji, h('span', { class: 'n' }, String(r.count)))),
      p.is_mine ? null : h('button', { class: 'rx add', 'aria-label': 'Add a reaction', onclick: pick }, icon('smile', 16)),
      h('span', { class: 'spacer' }),
      p.is_mine ? h('button', { class: 'btn ghost sm', onclick: remove }, icon('trash', 15), 'Delete')
        : h('button', { class: 'btn ghost sm', 'aria-label': 'Report', onclick: report }, icon('flag', 15))].filter(Boolean));
  }
  async function report() {
    if (!(await confirmDialog({ title: 'Report this?', message: 'It will be hidden for everyone once a few people report it, and the team will look at it.', confirmText: 'Report' }))) return;
    try { await rpc('flag_daily', { p_kind: kind, p_id: p.id }); toast('Thank you. We’ll take a look.'); } catch (e) { toastError(e); }
  }
  async function remove() {
    if (!(await confirmDialog({ title: 'Delete this?', message: 'It will be removed for everyone.', confirmText: 'Delete' }))) return;
    try { await rpc(kind === 'answer' ? 'delete_my_answer' : 'delete_my_letter', kind === 'answer' ? {} : { p_id: p.id }); box.remove(); onGone && onGone(); } catch (e) { toastError(e); }
  }
  box.append(...[
    kind === 'letter' ? h('div', { class: 'to' }, p.to_label ? `To ${p.to_label},` : 'To someone,') : null,
    h('p', { class: 'body' }, p.body),
    h('div', { class: 'meta faint small' }, p.is_mine ? 'You · ' : 'Anonymous · ', ago(p.created_at)),
    bar].filter(Boolean));
  draw();
  return box;
}

export function streakChip(s) {
  const n = s?.current || 0;
  return h('span', { class: 'streak' + (n ? ' on' : ''), title: `Longest: ${s?.best || 0} days` },
    '🔥 ', n ? `${n} day${n === 1 ? '' : 's'}` : 'Start a streak', badgeFor(n) ? ' ' + badgeFor(n) : '');
}

export function moodRow(state, onChange) {
  const row = h('div', { class: 'moods', role: 'group', 'aria-label': 'How are you feeling today?' });
  const draw = () => {
    const total = state.total || 0;
    row.replaceChildren(...MOODS.map(([face, label], i) => {
      const n = (state.counts || {})[String(i + 1)] || 0;
      const pct = total ? Math.round((n / total) * 100) : 0;
      return h('button', { class: 'mood' + (state.mine === i + 1 ? ' on' : ''), 'aria-pressed': String(state.mine === i + 1), 'aria-label': label, onclick: async () => {
        try { const r = await rpc('set_mood', { p_mood: i + 1 }); Object.assign(state, r); draw(); onChange && onChange(state); } catch (e) { toastError(e); }
      } }, h('span', { class: 'f' }, face), h('span', { class: 'l' }, state.mine ? `${pct}%` : label));
    }));
  };
  draw();
  return row;
}
