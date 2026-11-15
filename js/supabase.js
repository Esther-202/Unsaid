// Supabase client + a thin RPC wrapper. All app data goes through RPCs
// (SECURITY DEFINER functions) — the browser never touches identity tables.
import { SUPABASE_URL, SUPABASE_ANON_KEY, SDK_URL, isConfigured } from './config.js';

export let sb = null;
if (isConfigured()) {
  const { createClient } = await import(SDK_URL);
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

let onAccountProblem = () => {};
export const setAccountProblemHandler = (fn) => { onAccountProblem = fn; };

export async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    const e = new Error(error.message || 'Request failed');
    e.code = error.code; e.details = error.details;
    if (/account is not available|restricted and cannot|Please sign in/i.test(e.message)) onAccountProblem(e);
    throw e;
  }
  return data;
}

// Row-level-secured reads used for Realtime payload follow-ups (notifications only).
export async function listNotifications(limit = 60) {
  const { data, error } = await sb.from('notifications')
    .select('id,type,title,body,link,data,read,created_at').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data;
}
export async function deleteNotification(id) {
  const { error } = await sb.from('notifications').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
