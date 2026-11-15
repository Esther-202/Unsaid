// UNSAID platform administration (hidden: open /admin.html). Not linked from the app.
// Access is enforced by the database: every admin_* function refuses non-admins ("Not found").
// Looking up the account behind a report is written to the audit log by the database itself.
import { isConfigured } from './config.js';
import { h, $, icon, loading, toast, toastError, errMsg, confirmDialog, withBusy, empty, errorState, skeletons, dateTime, ago, debounce } from './ui.js';

const app = document.getElementById('app');
if (!isConfigured()) { app.replaceChildren(h('p', { style: { padding: '24px' } }, 'Configure js/config.js first.')); throw new Error('not configured'); }
const { sb, rpc } = await import('./supabase.js');
const { chatImageUrls } = await import('./images.js');
const { route, setMount, navigate, start } = await import('./router.js');

const notFound = () => { document.title = 'Not found'; app.replaceChildren(h('div', { class: 'empty', style: { paddingTop: '20vh' } }, h('h1', null, '404'), h('p', null, 'This page could not be found.'))); };

// ── sign-in (admins sign in here; nothing reveals whether this page is an admin area) ──
function login() {
  document.title = 'Sign in';
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', required: true, 'aria-label': 'Email' });
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true, 'aria-label': 'Password' });
  const err = h('div', { class: 'error-text', role: 'alert' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Continue');
  app.replaceChildren(h('div', { class: 'auth-wrap' }, h('form', { class: 'auth-card', onsubmit: (e) => { e.preventDefault(); err.textContent = '';
    withBusy(btn, async () => { const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
      if (error) { err.textContent = 'Those details didn’t work.'; return; } location.reload(); }); } },
    h('h1', null, 'Sign in'), h('div', { class: 'field' }, h('label', null, 'Email'), email), h('div', { class: 'field' }, h('label', null, 'Password'), pw), err, btn)));
}

const { data: s } = await sb.auth.getSession();
if (!s.session) { login(); throw new Error('signed out'); }
let me;
try { me = await rpc('my_account'); } catch { notFound(); throw new Error('no account'); }
if (!me.is_admin || me.status !== 'active') { notFound(); throw new Error('not admin'); }
document.title = 'UNSAID Admin';

// ── helpers ───────────────────────────────────────────────────
const statusTag = (st) => h('span', { class: 'tag ' + ({ active: 'ok', restricted: 'warn', suspended: 'danger', banned: 'danger', deactivated: '', pending: 'warn', investigating: 'warn', resolved: 'ok', dismissed: '' }[st] || '') }, st);
const table = (cols, rows, onClick) => h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, cols.map((c) => h('th', null, c)))),
  h('tbody', null, rows.length ? rows.map(([cells, key]) => h('tr', { class: onClick ? 'click' : '', tabindex: onClick ? 0 : null, onclick: onClick ? () => onClick(key) : null, onkeydown: onClick ? (e) => { if (e.key === 'Enter') onClick(key); } : null }, cells.map((c) => h('td', null, c))))
    : [h('tr', null, h('td', { colspan: cols.length, class: 'muted' }, 'Nothing here yet.'))])));
const kv = (pairs) => h('dl', { class: 'kv' }, pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v ?? '—')]));
const card = (title, ...kids) => h('div', { class: 'card', style: { marginBottom: '16px' } }, title ? h('div', { class: 'card-title' }, h('b', null, title)) : null, ...kids);
const fmt = (s) => String(s || '').replace(/_/g, ' ');

// ── shell ─────────────────────────────────────────────────────
const NAV = [['/', 'Overview'], ['/reports', 'Reports'], ['/users', 'Users'], ['/actions', 'Moderation log'], ['/audit', 'Audit log']];
const content = h('main', { class: 'admin-body', id: 'view' });
const nav = h('nav', { class: 'row wrap', 'aria-label': 'Admin sections' }, NAV.map(([p, l]) => h('a', { class: 'chip', href: '#' + p, dataset: { p } }, l)));
app.replaceChildren(h('div', { class: 'admin-shell' }, h('header', { class: 'admin-top' }, h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }, icon('shield', 17)), 'UNSAID Admin'), nav,
  h('div', { class: 'role row' }, h('span', { class: 'tag admin' }, me.is_admin ? 'Platform admin' : ''), h('a', { class: 'btn sm ghost', href: 'index.html' }, 'Open app'),
    h('button', { class: 'btn sm', onclick: async () => { await sb.auth.signOut(); location.reload(); } }, icon('logout', 16), 'Sign out'))), content));
setMount((layout, node, opts, path) => {
  nav.querySelectorAll('a').forEach((a) => { const p = a.dataset.p; a.classList.toggle('on', p === '/' ? path === '/' : path.startsWith(p)); });
  content.replaceChildren(node ? (node.el ?? node) : loading('Loading'));
});

// ── routes ────────────────────────────────────────────────────
route('/', overview, { layout: 'admin' });
route('/reports', reports, { layout: 'admin' });
route('/reports/:id', reportDetail, { layout: 'admin' });
route('/users', users, { layout: 'admin' });
route('/users/:id', userDetail, { layout: 'admin' });
route('/actions', actionsLog, { layout: 'admin' });
route('/audit', auditLog, { layout: 'admin' });
route('/__404__', () => ({ el: empty('search', 'Not found', '', h('a', { class: 'btn', href: '#/' }, 'Overview')) }), { notFound: true, layout: 'admin' });

// ── overview ──────────────────────────────────────────────────
async function overview() {
  const st = await rpc('admin_stats');
  const stat = (n, l, hot) => h('div', { class: 'stat' + (hot && n ? ' hot' : '') }, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l));
  return { el: h('div', null, h('div', { class: 'page-head' }, h('h1', null, 'Overview')),
    h('div', { class: 'stats' }, stat(st.total_users, 'Registered users'), stat(st.active_users, 'Active users'), stat(st.seen_7d, 'Seen in 7 days'), stat(st.suspended, 'Suspended / banned'), stat(st.restricted, 'Restricted'),
      stat(st.total_groups, 'Groups'), stat(st.public_groups, 'Public groups'), stat(st.private_groups, 'Private groups'), stat(st.total_reports, 'Total reports'), stat(st.pending_reports, 'Pending reports', true), stat(st.resolved_reports, 'Resolved reports')),
    card('Recent moderation activity', table(['When', 'Admin', 'Action', 'Reason'], st.recent_actions.map((a) => [[ago(a.created_at), a.admin_label, h('span', { class: 'tag' }, fmt(a.action)), a.reason], a.report_id]), (rid) => rid && navigate('/reports/' + rid)))) };
}

// ── reports queue ─────────────────────────────────────────────
async function reports() {
  let filter = 'open';
  const body = h('div', null, skeletons(4, 54)); const chips = h('div', { class: 'chips', style: { marginBottom: '14px' } });
  async function load() {
    chips.replaceChildren(...[['open', 'Open'], ['pending', 'Pending'], ['investigating', 'Investigating'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['', 'All']].map(([k, l]) => h('button', { class: 'chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; load(); } }, l)));
    body.replaceChildren(skeletons(4, 54));
    try {
      const rs = await rpc('admin_list_reports', { p_status: filter || null, p_limit: 100, p_offset: 0 });
      body.replaceChildren(table(['Reported', 'Type', 'Reason', 'Target', 'Prior reports', 'Status'], rs.map((r) => [[ago(r.created_at), fmt(r.target_type), fmt(r.category), r.target_label || '—', r.reports_against > 1 ? h('span', { class: 'tag warn' }, r.reports_against) : r.reports_against || 0, statusTag(r.status)], r.id]), (id) => navigate('/reports/' + id)));
    } catch (e) { body.replaceChildren(errorState(e, load)); }
  }
  load();
  return { el: h('div', null, h('div', { class: 'page-head' }, h('h1', null, 'Moderation queue')), chips, body) };
}

function snapshotView(r) {
  const sn = r.snapshot || {}; const out = [];
  if (sn.group) out.push(kv([['Group', sn.group.name], ['Description', sn.group.description], ['Rules', sn.group.rules], ['Privacy', sn.group.privacy]]));
  if (sn.username && !sn.message) out.push(kv([['Reported name', sn.username], ['Bio', sn.bio]]));
  const line = (l, hit) => h('div', { class: hit ? 'hit' : '' }, h('b', { class: 'mono' }, l.username), ' ', l.body || '', l.image_path ? h('img', { class: 'photo', dataset: { path: l.image_path }, alt: 'Reported image', style: { display: 'block', maxWidth: '240px', borderRadius: '8px', marginTop: '4px' } }) : null, h('span', { class: 'faint small' }, '  ' + dateTime(l.at)));
  if (sn.context?.length) out.push(h('div', null, h('div', { class: 'label', style: { marginBottom: '6px' } }, sn.message ? 'Reported message and the 12 messages before it' : 'Recent conversation (shared by the reporter)'),
    h('div', { class: 'ctx' }, sn.context.map((l) => line(l, sn.message && l.at === sn.message.at && l.username === sn.message.username)))));
  const wrap = h('div', { class: 'stack' }, out.length ? out : [h('p', { class: 'muted' }, 'No content snapshot.')]);
  setTimeout(async () => { const imgs = [...wrap.querySelectorAll('img[data-path]')]; if (!imgs.length) return; const urls = await chatImageUrls(imgs.map((i) => i.dataset.path)); imgs.forEach((i) => { const u = urls[i.dataset.path]; if (u) i.src = u; else i.alt = 'Image unavailable'; }); }, 0);
  return wrap;
}

// Reusable moderation form for an account (optionally tied to a report).
function actionForm(accountId, reportId, done) {
  const act = h('select', { class: 'select' }, [['warn', 'Issue a warning'], ['restrict', 'Restrict (read-only)'], ['suspend', 'Suspend'], ['ban', 'Permanently ban'], ['reinstate', 'Reinstate / lift']].map(([v, l]) => h('option', { value: v }, l)));
  const dur = h('select', { class: 'select' }, [['', 'Until I lift it'], ['1', '1 hour'], ['24', '24 hours'], ['72', '3 days'], ['168', '7 days'], ['720', '30 days']].map(([v, l]) => h('option', { value: v }, l)));
  const reason = h('textarea', { class: 'textarea', maxlength: 1000, placeholder: 'Reason (required — recorded in the moderation log; shown to the user for warnings and suspensions)' });
  const durField = h('div', { class: 'field' }, h('label', null, 'Duration'), dur);
  const sync = () => durField.classList.toggle('hidden', !['restrict', 'suspend'].includes(act.value)); act.onchange = sync; sync();
  const go = h('button', { class: 'btn primary' }, 'Apply action');
  go.onclick = async () => {
    if (!reason.value.trim()) { toast('Please record a reason.', 'error'); reason.focus(); return; }
    if (!await confirmDialog({ title: `Apply “${fmt(act.value)}”?`, message: act.value === 'ban' ? 'The account is banned immediately and its email can’t register again.' : 'This takes effect immediately and is logged.', confirmText: 'Apply', danger: ['ban', 'suspend'].includes(act.value) })) return;
    await withBusy(go, async () => { await rpc('admin_take_action', { p_account: accountId, p_action: act.value, p_reason: reason.value, p_hours: dur.value && !durField.classList.contains('hidden') ? +dur.value : null, p_report: reportId || null }); toast('Action recorded', 'success'); reason.value = ''; done(); });
  };
  return h('div', null, h('div', { class: 'field' }, h('label', null, 'Action'), act), durField, h('div', { class: 'field' }, h('label', null, 'Reason'), reason), h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, go));
}
const accountCard = (a) => kv([['Username (general)', h('span', { class: 'mono' }, a.username)], ['Email', a.email], ['Account ID', h('span', { class: 'mono small' }, a.account_id)], ['Status', [statusTag(a.status), a.status_until ? ' until ' + dateTime(a.status_until) : '']],
  a.status_reason ? ['Status reason', a.status_reason] : null, ['Registered', dateTime(a.created_at)], ['Last seen', a.last_seen_at ? ago(a.last_seen_at) + ' ago' : '—'], ['Reports against', a.reports_against], ['Active groups', a.groups]]);

async function reportDetail(ctx) {
  const id = ctx.params.id;
  const d = await rpc('admin_get_report', { p_report: id });   // audited reveal of the reported account
  const r = d.report;
  const reload = () => navigate('/reports/' + id, { replace: false });
  const note = h('textarea', { class: 'textarea', maxlength: 1000, placeholder: 'Decision / reason (required to close)' });
  const outcome = h('select', { class: 'select' }, [['action_taken', 'Action was taken'], ['no_action', 'No action needed']].map(([v, l]) => h('option', { value: v }, l)));
  const closeBtns = h('div', { class: 'row wrap' },
    h('button', { class: 'btn', onclick: (e) => withBusy(e.currentTarget, async () => { await rpc('admin_resolve_report', { p_report: id, p_status: 'investigating', p_note: note.value || null, p_outcome: null }); toast('Marked as investigating', 'success'); reload(); }) }, 'Mark investigating'),
    h('button', { class: 'btn', onclick: (e) => withBusy(e.currentTarget, async () => { if (!note.value.trim()) { toast('Add the reason for dismissing.', 'error'); return; } await rpc('admin_resolve_report', { p_report: id, p_status: 'dismissed', p_note: note.value, p_outcome: 'no_action' }); toast('Report dismissed', 'success'); navigate('/reports'); }) }, 'Dismiss (unfounded)'),
    h('button', { class: 'btn primary', onclick: (e) => withBusy(e.currentTarget, async () => { if (!note.value.trim()) { toast('Add the reason for the decision.', 'error'); return; } await rpc('admin_resolve_report', { p_report: id, p_status: 'resolved', p_note: note.value, p_outcome: outcome.value }); toast('Report resolved', 'success'); navigate('/reports'); }) }, 'Resolve'));
  const removable = ['group_message', 'image', 'dm_message', 'group'].includes(r.target_type);
  const removeBtn = removable ? h('button', { class: 'btn danger', onclick: async () => {
    if (!await confirmDialog({ title: r.target_type === 'group' ? 'Delete the reported group?' : 'Remove the reported content?', message: 'This is logged and cannot be undone.', confirmText: 'Remove', danger: true })) return;
    const why = note.value.trim() || 'Removed after report review'; try { await rpc('admin_remove_content', { p_report: id, p_reason: why }); toast('Content removed', 'success'); reload(); } catch (e) { toastError(e); } } }, icon('trash', 16), r.target_type === 'group' ? 'Delete group' : 'Remove content') : null;
  const closed = ['resolved', 'dismissed'].includes(r.status);
  return { el: h('div', null,
    h('div', { class: 'page-head' }, h('div', { class: 'row' }, h('a', { class: 'btn ghost', href: '#/reports' }, icon('back', 16), 'Queue'), h('h1', null, 'Report'), statusTag(r.status))),
    h('div', { class: 'split' },
      h('div', null,
        card('Report', kv([['Filed', dateTime(r.created_at)], ['Type', fmt(r.target_type)], ['Reason', fmt(r.category)], ['Target', r.target_label], ['Reporter’s details', r.details || '—'], closed ? ['Decision', [fmt(r.outcome), ' — ', r.resolution_note]] : null])),
        card('Reported content & context', snapshotView(r)),
        card('Previous reports about this account', table(['When', 'Type', 'Reason', 'Status'], d.previous_reports.map((p) => [[ago(p.created_at), fmt(p.target_type), fmt(p.category), statusTag(p.status)], p.id]), (pid) => navigate('/reports/' + pid)))),
      h('div', null,
        d.reported ? card('Account behind the reported name', accountCard(d.reported), h('div', { style: { marginTop: '12px' } }, h('a', { class: 'btn sm', href: '#/users/' + d.reported.account_id }, 'Open full account')))
          : card('Account', h('p', { class: 'muted' }, 'The account no longer exists or could not be identified.')),
        d.reported ? card('Take action on this account', h('p', { class: 'hint', style: { marginTop: 0 } }, 'Warnings and suspensions are enforced by the database immediately; suspended users are signed out of every session.'), actionForm(d.reported.account_id, id, reload)) : null,
        card('Close this report', note, h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', null, 'Outcome (when resolving)'), outcome), closeBtns, removeBtn ? h('div', { style: { marginTop: '12px' } }, removeBtn) : null),
        card('Actions logged for this case', table(['When', 'Admin', 'Action', 'Reason'], d.actions.map((a) => [[ago(a.created_at), a.admin_label, h('span', { class: 'tag' }, fmt(a.action)), a.reason], a.id]))))) ) };
}

// ── users ─────────────────────────────────────────────────────
async function users() {
  let q = '', st = '';
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Search by email, generated username (User_…) or account ID', 'aria-label': 'Search accounts' });
  const sel = h('select', { class: 'select', 'aria-label': 'Status filter', style: { maxWidth: '200px' } }, [['', 'Any status'], ['active', 'Active'], ['restricted', 'Restricted'], ['suspended', 'Suspended'], ['banned', 'Banned'], ['deactivated', 'Deactivated']].map(([v, l]) => h('option', { value: v }, l)));
  const body = h('div', null, skeletons(4, 54)); let seq = 0;
  async function load() {
    const my = ++seq; body.replaceChildren(skeletons(4, 54));
    try {
      const us = await rpc('admin_search_accounts', { p_query: q || null, p_status: st || null, p_limit: 50 }); if (my !== seq) return;
      body.replaceChildren(table(['Username', 'Email', 'Status', 'Reports', 'Registered', 'Last seen'], us.map((u) => [[h('span', { class: 'mono' }, u.username), u.email, statusTag(u.status), u.reports_against, ago(u.created_at) + ' ago', u.last_seen_at ? ago(u.last_seen_at) + ' ago' : '—'], u.account_id]), (aid) => navigate('/users/' + aid)));
    } catch (e) { if (my === seq) body.replaceChildren(errorState(e, load)); }
  }
  input.addEventListener('input', debounce(() => { q = input.value.trim(); load(); }, 400)); sel.onchange = () => { st = sel.value; load(); };
  load();
  return { el: h('div', null, h('div', { class: 'page-head' }, h('h1', null, 'Accounts')), h('div', { class: 'row', style: { marginBottom: '14px' } }, h('div', { class: 'grow' }, input), sel),
    h('p', { class: 'hint' }, 'Searches are written to the audit log.'), body) };
}
async function userDetail(ctx) {
  const id = ctx.params.id;
  const d = await rpc('admin_get_account', { p_account: id });
  const a = d.account, act = d.activity;
  const reload = () => navigate('/users/' + id);
  return { el: h('div', null, h('div', { class: 'page-head' }, h('div', { class: 'row' }, h('a', { class: 'btn ghost', href: '#/users' }, icon('back', 16), 'Accounts'), h('h1', { class: 'mono' }, a.username), statusTag(a.status))),
    h('div', { class: 'split' },
      h('div', null, card('Account', accountCard(a)),
        card('Activity', kv([['Group messages', act.group_messages], ['Private messages', act.dm_messages], ['Groups joined', act.groups_joined], ['Times blocked', act.blocks_received]])),
        card('Reports against this account', table(['When', 'Type', 'Reason', 'Status'], d.reports.map((p) => [[ago(p.created_at), fmt(p.target_type), fmt(p.category), statusTag(p.status)], p.id]), (rid) => navigate('/reports/' + rid)))),
      h('div', null, a.is_admin ? card('Moderation', h('p', { class: 'muted' }, 'Platform admins can’t be moderated from here.')) : card('Moderate this account', actionForm(a.account_id, null, reload)),
        card('Moderation history', table(['When', 'Admin', 'Action', 'Reason'], d.actions.map((m) => [[ago(m.created_at), m.admin_label, h('span', { class: 'tag' }, fmt(m.action)), m.reason], m.id])))))) };
}

// ── logs ──────────────────────────────────────────────────────
async function actionsLog() {
  const rows = await rpc('admin_list_actions', { p_limit: 200 });
  return { el: h('div', null, h('div', { class: 'page-head' }, h('h1', null, 'Moderation log')),
    table(['Date', 'Administrator', 'Action', 'Account', 'Reason', 'Report'], rows.map((a) => [[dateTime(a.created_at), a.admin_label, h('span', { class: 'tag' }, fmt(a.action)), a.target_username ? h('span', { class: 'mono' }, a.target_username) : '—', a.reason, a.report_id ? h('a', { href: '#/reports/' + a.report_id }, 'Open') : '—'], null]))) };
}
async function auditLog() {
  const rows = await rpc('admin_list_audit', { p_limit: 200 });
  return { el: h('div', null, h('div', { class: 'page-head' }, h('h1', null, 'Audit log')), h('p', { class: 'hint' }, 'Every time an admin looks up an account behind a report, searches accounts, or acts, it is recorded here.'),
    table(['Date', 'Admin', 'Event', 'Entity', 'Details'], rows.map((a) => [[dateTime(a.created_at), a.admin_email || '—', fmt(a.action), (a.entity || '') + (a.entity_id ? ' · ' + a.entity_id.slice(0, 8) : ''), h('span', { class: 'mono small' }, a.meta && Object.keys(a.meta).length ? JSON.stringify(a.meta) : '')], null]))) };
}

try { await start(); } catch (e) { content.replaceChildren(errorState(e)); }
