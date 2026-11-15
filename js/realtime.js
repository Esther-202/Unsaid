// Supabase Realtime subscriptions. Postgres-changes events are filtered by RLS on the
// server, so a client only ever receives rows it is allowed to read. Payloads carry
// ids only — details are fetched through RPCs.
import { sb } from './supabase.js';
import { store, refreshCounts, emit } from './store.js';
import { toast } from './ui.js';

function channel(name, specs, onStatus) {
  const ch = sb.channel(name);
  specs.forEach(([table, event, filter, cb]) => ch.on('postgres_changes', { event, schema: 'public', table, filter }, cb));
  ch.subscribe((status) => onStatus?.(status));
  return () => { sb.removeChannel(ch); };
}
export function watchGroup(groupId, { onMessage, onReaction, onStatus }) {
  const f = `group_id=eq.${groupId}`;
  return channel(`grp-${groupId}`, [
    ['group_messages', 'INSERT', f, (p) => onMessage(p.new.id)],
    ['group_messages', 'UPDATE', f, (p) => onMessage(p.new.id)],
    ['group_reactions', 'INSERT', f, (p) => onReaction(p.new.message_id)],
  ], onStatus);
}
export function watchConversation(convId, { onMessage, onReaction, onStatus }) {
  const f = `conversation_id=eq.${convId}`;
  return channel(`dm-${convId}`, [
    ['dm_messages', 'INSERT', f, (p) => onMessage(p.new.id)],
    ['dm_messages', 'UPDATE', f, (p) => onMessage(p.new.id)],
    ['dm_reactions', 'INSERT', f, (p) => onReaction(p.new.message_id)],
  ], onStatus);
}

let stopNotif = null, pollTimer = null;
export function startNotificationWatcher() {
  stopNotificationWatcher();
  const uid = store.session?.user?.id; if (!uid) return;
  stopNotif = channel(`notif-${uid}`, [['notifications', 'INSERT', `account_id=eq.${uid}`, (p) => {
    refreshCounts(); emit('notification', p.new);
    if (!/^#\/(g|messages)\//.test(location.hash) || !location.hash.includes(p.new.link?.split('/')[2] || '§')) toast(`${p.new.title}${p.new.body ? ' — ' + p.new.body : ''}`, 'info', 4500);
  }], ['notifications', 'UPDATE', `account_id=eq.${uid}`, () => refreshCounts()]]);
  pollTimer = setInterval(() => { if (!document.hidden) refreshCounts(); }, 30000);
}
export function stopNotificationWatcher() { stopNotif?.(); stopNotif = null; clearInterval(pollTimer); pollTimer = null; }
