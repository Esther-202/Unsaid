// Cloudflare Turnstile helper. Does nothing (and loads nothing) until a site key is set in captcha-config.js.
// Why this exists: when CAPTCHA is switched on in Supabase, every sign-up, sign-in, password reset and
// "resend email" must carry a fresh token. Tokens work once, so the box is reset after each use.
import { CAPTCHA_SITE_KEY } from './captcha-config.js';

export const captchaOn = () => !!CAPTCHA_SITE_KEY;

let scriptP = null;
function loadScript() {
  scriptP ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.onload = resolve;
    s.onerror = () => { scriptP = null; reject(new Error('Could not load the security check. Check your connection and try again.')); };
    document.head.append(s);
  });
  return scriptP;
}

// captchaBox() → { el, token(), reset() }.  Put `el` in a form; call `await token()` before the request.
export function captchaBox() {
  if (!captchaOn()) return { el: document.createTextNode(''), enabled: false, token: async () => undefined, reset() {} };
  const el = document.createElement('div'); el.className = 'captcha'; el.setAttribute('aria-label', 'Security check');
  let widget = null, tok = null, failed = null; const waiters = [];
  const settle = (fn) => { while (waiters.length) fn(waiters.shift()); };
  loadScript().then(() => setTimeout(() => {
    if (!window.turnstile) return;
    widget = window.turnstile.render(el, {
      sitekey: CAPTCHA_SITE_KEY, theme: 'dark', appearance: 'interaction-only', size: 'flexible',
      callback: (t) => { tok = t; failed = null; settle((w) => w.ok(t)); },
      'expired-callback': () => { tok = null; },
      'error-callback': () => { tok = null; failed = new Error('The security check could not run. Reload the page and try again.'); settle((w) => w.err(failed)); },
    });
  }, 0)).catch((e) => { failed = e; settle((w) => w.err(e)); });
  return {
    el, enabled: true,
    token: () => tok ? Promise.resolve(tok) : failed ? Promise.reject(failed)
      : new Promise((ok, err) => { const w = { ok, err }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); err(new Error('The security check is taking too long. Please try again.')); } }, 20000); }),
    reset() { tok = null; try { if (widget != null && window.turnstile) window.turnstile.reset(widget); } catch { /* ignore */ } },
  };
}
