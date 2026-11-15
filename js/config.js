// ─────────────────────────────────────────────────────────────
//  UNSAID configuration — the ONLY file you need to edit.
//  Supabase dashboard → Project Settings → API:
//    • Project URL           → SUPABASE_URL
//    • "anon" / public key   → SUPABASE_ANON_KEY
//  (Never put the service_role key in front-end code.)
// ─────────────────────────────────────────────────────────────
export const SUPABASE_URL = 'https://kvblnkgganqkkmqpfhzg.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_BCx1gqVoWheV0-GV2pV_TQ_gSEfYYfO';
export const APP_NAME = 'UNSAID';
export const TAGLINE = 'There’s more to say when nobody knows it’s you.';
export const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const isConfigured = () => !/YOUR-/.test(SUPABASE_URL + SUPABASE_ANON_KEY);
