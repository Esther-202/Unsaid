// Screens for the key backup: set up, restore on a new device, start over.
import { h, modal, toast, toastError, withBusy, confirmDialog, copyText } from '../ui.js';
import { store } from '../store.js';
import { S, createBackup, restoreBackup, startNewSeed } from '../keys.js';
import { newRecoveryCode } from '../e2ee.js';

const uid = () => store.session?.user?.id;
function passProblem(p) {
  if (p.length < 10) return 'Use at least 10 characters.';
  if (new Set(p).size < 5) return 'Use a more varied passphrase (a few random words works well).';
  return null;
}

/** Choose how to protect the keys, then save the encrypted backup. onDone() after saving. */
export function openBackupSetup(onDone) {
  let mode = 'recovery'; const code = newRecoveryCode();
  const body = h('div', { class: 'stack', style: { gap: '12px' } });
  const err = h('div', { class: 'error-text', role: 'alert' });
  const pw1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Passphrase (10+ characters)', 'aria-label': 'Passphrase' });
  const pw2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Repeat passphrase', 'aria-label': 'Repeat passphrase' });
  const saved = h('input', { type: 'checkbox', 'aria-label': 'I have saved the recovery code' });
  const choice = (v, title, desc) => h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'bk', value: v, checked: mode === v, onchange: () => { mode = v; paint(); } }), h('div', null, h('b', null, title), h('div', { class: 'hint' }, desc)));
  function paint() {
    body.replaceChildren(
      h('p', { class: 'muted small', style: { margin: 0 } }, 'Your private chats are locked with keys that live only on this device. A backup lets you get them back on a new phone or computer. It is locked in your browser before it is saved, so UNSAID can’t read it, and nobody can reset it for you.'),
      choice('recovery', 'Recovery code (recommended)', 'A random code you keep somewhere safe. Much stronger than a passphrase.'),
      choice('passphrase', 'Passphrase', 'A phrase you choose and remember. Use something long that you don’t use anywhere else.'),
      mode === 'recovery'
        ? h('div', { class: 'stack', style: { gap: '8px' } },
            h('div', { class: 'mono', style: { fontSize: '1.1rem', textAlign: 'center', letterSpacing: '.06em', padding: '12px', border: '1px dashed var(--border, #3a3f55)', borderRadius: '10px', userSelect: 'all' } }, code),
            h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn sm', type: 'button', onclick: () => copyText(code) }, 'Copy code')),
            h('label', { class: 'row small', style: { gap: '8px' } }, saved, 'I’ve saved this code somewhere safe (not only on this device).'))
        : h('div', { class: 'stack', style: { gap: '8px' } }, pw1, pw2),
      err);
  }
  paint();
  const m = modal({ title: S.hasBackup ? 'Change your key backup' : 'Back up your private chat keys', body,
    actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Not now'),
      h('button', { class: 'btn primary', onclick: (e) => withBusy(e.currentTarget, async () => {
        err.textContent = '';
        if (mode === 'recovery') { if (!saved.checked) { err.textContent = 'Please confirm you saved the code.'; return; } await createBackup(uid(), code, 'recovery'); }
        else {
          const p = passProblem(pw1.value); if (p) { err.textContent = p; return; }
          if (pw1.value !== pw2.value) { err.textContent = 'The two passphrases don’t match.'; return; }
          await createBackup(uid(), pw1.value, 'passphrase');
        }
        m.close(); toast('Backup saved. You can now restore your chats on a new device.', 'success', 5000); onDone?.();
      }).catch((er) => { err.textContent = er.message || 'Couldn’t save the backup.'; }) }, 'Save backup')] });
}

/** Enter the passphrase / recovery code to bring the keys back on this device. */
export function openRestore(onDone) {
  const secret = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: S.backupKind === 'recovery' ? 'Recovery code (XXXX-XXXX-…)' : 'Your passphrase', 'aria-label': 'Passphrase or recovery code' });
  const err = h('div', { class: 'error-text', role: 'alert' });
  const m = modal({ title: 'Restore your private chat keys', body: h('div', { class: 'stack', style: { gap: '10px' } },
      h('p', { class: 'muted small', style: { margin: 0 } }, S.hasBackup
        ? 'This device doesn’t have your private chat keys yet. Enter your ' + (S.backupKind === 'recovery' ? 'recovery code' : 'passphrase') + ' to open your older private messages here.'
        : 'This account has private chat keys on another device, but no backup was set up. Without a backup, older private messages can’t be opened here. You can start new keys instead.'),
      S.hasBackup ? secret : null, err),
    actions: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Later'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!await confirmDialog({ title: 'Start new keys on this device?', message: 'You’ll be able to send and receive new private messages here. Older private messages (and voice notes) can’t be opened afterwards, and any backup you made is removed.', confirmText: 'Start new keys', danger: true })) return;
        try { await startNewSeed(uid()); m.close(); toast('New keys created on this device.', 'success'); onDone?.(); } catch (e) { toastError(e); }
      } }, 'Start new keys'),
      S.hasBackup ? h('button', { class: 'btn primary', onclick: (e) => withBusy(e.currentTarget, async () => {
        err.textContent = ''; if (!secret.value.trim()) { err.textContent = 'Enter it first.'; return; }
        const ok = await restoreBackup(uid(), secret.value.trim());
        if (!ok) { err.textContent = S.backupKind === 'recovery' ? 'That code doesn’t match. Check it and try again.' : 'That passphrase doesn’t match. Check it and try again.'; return; }
        m.close(); toast('Keys restored. Your older private chats can be opened on this device.', 'success', 5000); onDone?.();
      }).catch((er) => { err.textContent = er.message || 'Couldn’t restore.'; }) }, 'Restore') : null].filter(Boolean) });
  setTimeout(() => secret.focus(), 50);
}
