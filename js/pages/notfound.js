import { h, icon, setTitle } from '../ui.js';
export default function notfound() {
  setTitle('Not found');
  return h('div', { class: 'auth-wrap' }, h('div', { class: 'empty' }, h('div', { class: 'ico' }, icon('ghost', 26)), h('h1', null, 'Nothing here'), h('p', null, 'This page doesn’t exist, or you don’t have access to it.'), h('a', { class: 'btn primary', href: '#/home' }, 'Go home')));
}
