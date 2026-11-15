// Hash router. Patterns like '/g/:id/info'; query string after '?'.
const routes = [];
let current = null, token = 0, mountFn = null, guardFn = null;

export function route(pattern, loader, opts = {}) {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, loader, opts });
}
export const setMount = (fn) => { mountFn = fn; };
export const setGuard = (fn) => { guardFn = fn; };
export function navigate(path, { replace = false } = {}) {
  const h = path.startsWith('#') ? path : '#' + path;
  if (replace) { history.replaceState(null, '', h); resolve(); } else if (location.hash === h) resolve(); else location.hash = h;
}
export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}
export async function resolve() {
  const my = ++token;
  const { path, query } = parseHash();
  let hit = null;
  for (const r of routes) { const m = r.re.exec(path); if (m) { hit = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; break; } }
  if (!hit) hit = { r: routes.find((x) => x.opts.notFound), params: {} };
  const redirect = guardFn ? guardFn(hit.r.opts, path) : null;
  if (redirect) { navigate(redirect, { replace: true }); return; }
  try { current?.destroy?.(); } catch (e) { console.error(e); }
  current = null;
  const ctx = { params: hit.params, query, path, navigate, isStale: () => my !== token };
  mountFn(hit.r.opts.layout || 'app', null, hit.r.opts, path);            // swap layout + show spinner
  try {
    const page = await hit.r.loader(ctx);
    if (my !== token) { page?.destroy?.(); return; }
    current = page;
    mountFn(hit.r.opts.layout || 'app', page?.el ?? page, hit.r.opts, path);
    window.scrollTo(0, 0);
  } catch (e) { console.error(e); if (my === token) mountFn(hit.r.opts.layout || 'app', errorNode(e), hit.r.opts, path); }
}
function errorNode(e) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = 'Something went wrong: ' + (e?.message || e); return d; }
export function start() { window.addEventListener('hashchange', resolve); return resolve(); }
export const refresh = () => resolve();
