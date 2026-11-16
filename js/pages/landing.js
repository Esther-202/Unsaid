import { h, icon, setTitle } from '../ui.js';
import { TAGLINE } from '../config.js';

export default function landing() {
  setTitle('');
  const feat = (ic, t, p) => h('div', { class: 'feature' }, h('div', { class: 'ico' }, icon(ic, 22)), h('h3', null, t), h('p', { class: 'muted small', style: { margin: 0 } }, p));
  return h('div', null,
    h('div', { class: 'landing-nav' }, h('span', { class: 'brand' }, h('span', { class: 'brand-mark' }, icon('ghost', 17)), 'UNSAID'),
      h('div', { class: 'row' }, h('a', { class: 'btn ghost sm', href: '#/login' }, 'Sign in'), h('a', { class: 'btn primary sm', href: '#/register' }, 'Join'))),
    h('section', { class: 'hero' }, h('span', { class: 'tag admin' }, 'Anonymous by design'),
      h('h1', null, TAGLINE), h('p', { class: 'lead' }, 'Join communities, share what you really think and talk one-to-one — without ever revealing who you are. Not even to the people you talk to.'),
      h('div', { class: 'cta' }, h('a', { class: 'btn primary', href: '#/register' }, 'Create your anonymous account'), h('a', { class: 'btn', href: '#/login' }, 'I already have one'))),
    h('section', { class: 'identity-demo', 'aria-label': 'How identities work' }, h('div', { class: 'card' },
      h('h3', null, 'One person. Many unconnected identities.'), h('p', { class: 'muted small', style: { margin: 0 } }, 'Every group and every private chat gives you a brand-new random name. Nobody can link them together.'),
      [['Late-night confessions', 'SilentMoon27'], ['Career advice', 'BlueOrbit23'], ['Private chat', 'QuietStar91']].map(([w, n]) => h('div', { class: 'idrow' }, h('span', { class: 'muted' }, w), h('b', { class: 'mono' }, n))))),
    h('section', { class: 'features' },
      feat('ghost', 'Separate identity everywhere', 'A different anonymous username in every group and conversation — enforced by the database, not just the screen.'),
      feat('users', 'Communities with real control', 'Public or private groups, invite links, polls, announcements and moderators — all anonymous.'),
      feat('shield', 'Safe by default', 'No unsolicited DMs. Block, report and mute everywhere. A trained team reviews reports; admins never see your chats unless you report them.')),
    h('footer', { class: 'footer' }, '© UNSAID · Say it. Nobody has to know it was you.'));
}
