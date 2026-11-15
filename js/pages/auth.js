// Registration, login, password recovery, email verification.
import { sb } from '../supabase.js';
import { store } from '../store.js';
import { h, icon, toast, errMsg, setTitle, withBusy } from '../ui.js';
import { navigate } from '../router.js';

const redirectTo = (flow) => `${location.origin}${location.pathname}${flow ? '?flow=' + flow : ''}`;
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
function pwProblem(p) {
  if (p.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use a mix of letters and numbers.';
  return null;
}
function field(label, input, hint) { const wrap = h('div', { class: 'field' }, h('label', { for: input.id }, label), input, hint ? h('div', { class: 'hint' }, hint) : null, h('div', { class: 'error-text', role: 'alert' })); return wrap; }
const setErr = (wrap, msg) => { wrap.classList.toggle('invalid', !!msg); wrap.querySelector('.error-text').textContent = msg || ''; return !msg; };
const shell = (...kids) => h('div', { class: 'auth-wrap' }, h('div', { class: 'auth-card' },
  h('a', { class: 'brand', href: '#/', style: { marginBottom: '22px' } }, h('span', { class: 'brand-mark' }, icon('ghost', 17)), 'UNSAID'), ...kids));
const input = (id, type, extra = {}) => h('input', { id, type, class: 'input', required: true, ...extra });

export function login() {
  setTitle('Sign in');
  const email = input('email', 'email', { autocomplete: 'email', placeholder: 'you@example.com' });
  const pw = input('pw', 'password', { autocomplete: 'current-password', placeholder: 'Your password' });
  const eW = field('Email', email), pW = field('Password', pw);
  const msg = h('div', { class: 'alert error hidden', role: 'alert' });
  const resend = h('button', { type: 'button', class: 'btn ghost sm hidden', onclick: async (e) => withBusy(e.currentTarget, async () => {
    const { error } = await sb.auth.resend({ type: 'signup', email: email.value.trim(), options: { emailRedirectTo: redirectTo() } });
    if (error) throw error; toast('Verification email sent.', 'success'); }) }, 'Resend verification email');
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); msg.classList.add('hidden'); resend.classList.add('hidden');
    const ok = setErr(eW, emailOk(email.value.trim()) ? '' : 'Enter a valid email address.') & setErr(pW, pw.value ? '' : 'Enter your password.'); if (!ok) return;
    await withBusy(btn, async () => {
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
      if (error) {
        const m = /Invalid login/i.test(error.message) ? 'That email and password don’t match.' : /not confirmed/i.test(error.message) ? 'Please verify your email first. Check your inbox.' : /banned/i.test(error.message) ? 'This account is not available.' : errMsg(error);
        msg.textContent = m; msg.classList.remove('hidden'); if (/verify/i.test(m)) resend.classList.remove('hidden');
      }
    });
  } });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Sign in');
  form.append(eW, pW, msg, btn, h('div', { style: { marginTop: '10px' } }, resend));
  return shell(h('h1', null, 'Welcome back'), h('p', { class: 'muted' }, 'Sign in to your anonymous account.'), form,
    h('div', { class: 'row between', style: { marginTop: '18px' } }, h('a', { href: '#/forgot', class: 'small' }, 'Forgot password?'), h('a', { href: '#/register', class: 'small' }, 'Create an account')));
}

export function register() {
  setTitle('Create account');
  const email = input('email', 'email', { autocomplete: 'email', placeholder: 'you@example.com' });
  const pw = input('pw', 'password', { autocomplete: 'new-password', placeholder: 'At least 8 characters', minlength: 8 });
  const pw2 = input('pw2', 'password', { autocomplete: 'new-password', placeholder: 'Repeat password' });
  const eW = field('Email', email, 'Only used to sign in and recover your account. It is never shown to anyone.'), pW = field('Password', pw), p2W = field('Confirm password', pw2);
  const agree = h('input', { type: 'checkbox', id: 'agree' });
  const aW = h('div', { class: 'field' }, h('label', { class: 'row', for: 'agree', style: { fontWeight: 400, alignItems: 'flex-start' } }, agree, h('span', { class: 'small muted' }, 'I’m at least 13 years old and I’ll be kind. Harassment, threats and spam get accounts removed.')), h('div', { class: 'error-text', role: 'alert' }));
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Create anonymous account');
  const msg = h('div', { class: 'alert error hidden', role: 'alert' });
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); msg.classList.add('hidden');
    const ok = setErr(eW, emailOk(email.value.trim()) ? '' : 'Enter a valid email address.') & setErr(pW, pwProblem(pw.value) || '')
      & setErr(p2W, pw.value === pw2.value ? '' : 'Passwords don’t match.') & setErr(aW, agree.checked ? '' : 'Please confirm to continue.');
    if (!ok) return;
    await withBusy(btn, async () => {
      const { data, error } = await sb.auth.signUp({ email: email.value.trim(), password: pw.value, options: { emailRedirectTo: redirectTo() } });
      if (error) { msg.textContent = /registered|already/i.test(error.message) ? 'That email is already registered. Try signing in.' : errMsg(error); msg.classList.remove('hidden'); return; }
      if (!data.session) navigate('/verify?email=' + encodeURIComponent(email.value.trim()));
    });
  } });
  form.append(eW, pW, p2W, aW, msg, btn);
  return shell(h('h1', null, 'Join anonymously'), h('p', { class: 'muted' }, 'No real name, no public profile. You’ll get a random username like ', h('span', { class: 'mono' }, 'User_839201'), ' the moment you sign up.'), form,
    h('p', { class: 'small muted', style: { marginTop: '18px', textAlign: 'center' } }, 'Already have an account? ', h('a', { href: '#/login' }, 'Sign in')));
}

export function verify(ctx) {
  setTitle('Verify your email');
  const email = ctx.query.email || '';
  return shell(h('div', { class: 'empty', style: { padding: '10px 0' } }, h('div', { class: 'ico' }, icon('mail', 26)), h('h1', null, 'Check your email'),
    h('p', null, email ? ['We sent a verification link to ', h('b', null, email), '.'] : 'We sent you a verification link.'), h('p', { class: 'small' }, 'Open it on this device to finish creating your account. It may take a minute — check spam too.'),
    email ? h('button', { class: 'btn', onclick: (e) => withBusy(e.currentTarget, async () => { const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo() } }); if (error) throw error; toast('Sent again.', 'success'); }) }, 'Resend email') : null,
    h('p', { style: { marginTop: '16px' } }, h('a', { href: '#/login' }, 'Back to sign in'))));
}

export function forgot() {
  setTitle('Reset password');
  const email = input('email', 'email', { autocomplete: 'email', placeholder: 'you@example.com' });
  const eW = field('Email', email); const done = h('div', { class: 'alert success hidden', role: 'status' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Send reset link');
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); if (!setErr(eW, emailOk(email.value.trim()) ? '' : 'Enter a valid email address.')) return;
    await withBusy(btn, async () => {
      const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: redirectTo('recovery') });
      if (error && !/rate|seconds/i.test(error.message)) throw error;
      done.textContent = 'If an account exists for that email, a reset link is on its way.'; done.classList.remove('hidden');
    });
  } }, eW, btn, h('div', { style: { marginTop: '12px' } }, done));
  return shell(h('h1', null, 'Forgot your password?'), h('p', { class: 'muted' }, 'Enter your email and we’ll send a link to choose a new one.'), form,
    h('p', { class: 'small', style: { marginTop: '18px', textAlign: 'center' } }, h('a', { href: '#/login' }, 'Back to sign in')));
}

export function reset() {
  setTitle('Choose a new password');
  if (!store.session) return shell(h('div', { class: 'empty' }, h('h1', null, 'Link expired'), h('p', null, 'This reset link is invalid or has expired.'), h('a', { class: 'btn primary', href: '#/forgot' }, 'Request a new link')));
  const pw = input('pw', 'password', { autocomplete: 'new-password', placeholder: 'New password' });
  const pw2 = input('pw2', 'password', { autocomplete: 'new-password', placeholder: 'Repeat new password' });
  const pW = field('New password', pw, 'At least 8 characters, with letters and numbers.'), p2W = field('Confirm new password', pw2);
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Update password');
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); const ok = setErr(pW, pwProblem(pw.value) || '') & setErr(p2W, pw.value === pw2.value ? '' : 'Passwords don’t match.'); if (!ok) return;
    await withBusy(btn, async () => { const { error } = await sb.auth.updateUser({ password: pw.value }); if (error) throw error; store.recovery = false; toast('Password updated.', 'success'); navigate('/home'); });
  } }, pW, p2W, btn);
  return shell(h('h1', null, 'Choose a new password'), form);
}
