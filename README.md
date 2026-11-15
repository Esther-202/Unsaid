# UNSAID — There’s more to say when nobody knows it’s you.

Anonymous communities + private chats. Plain HTML/CSS/JavaScript (no build step) on Supabase.

## Setup (≈10 min)

1. **Create a Supabase project** (supabase.com → New project).
2. **Create the database**: Dashboard → SQL Editor → paste `supabase/unsaid_all_in_one.sql` → Run.
   - Or run separately, in order: `01_schema` → `02_core_functions` → `03_messaging_functions` → `04_moderation_functions` → `05_security`.
   - Re-run `05_security.sql` any time you change a function or table.
3. **Auth settings** (Dashboard → Authentication):
   - Providers → Email: enable, keep **Confirm email** ON.
   - URL Configuration → **Site URL** and **Redirect URLs**: add the address you host the app at (e.g. `http://localhost:8080/` while testing).
4. **Connect the app**: open `js/config.js`, paste **Project URL** and **anon key** (Project Settings → API). Never use the `service_role` key.
5. **Run it**: serve the folder with any static server, e.g. `python3 -m http.server 8080` then open `http://localhost:8080`.
6. **Make yourself platform admin**: register in the app, confirm your email, then edit the email in `supabase/06_make_admin.sql` and run it. Open `/admin.html` (not linked anywhere in the app).
7. **Check it** (optional): run `supabase/tests/rls_tests.sql` in the SQL Editor. It rolls back and ends with `ALL TESTS PASSED`.

## Files

| Path | What it is |
|---|---|
| `index.html`, `admin.html` | App entry · hidden admin entry |
| `css/` | `tokens` (colours) · `base` · `components` · `layout` · `chat` · `admin` |
| `js/app.js`, `router.js`, `store.js`, `supabase.js`, `realtime.js` | Boot, hash routes, session/account state, RPC wrapper, live updates |
| `js/ui.js`, `icons.js`, `images.js`, `config.js` | UI helpers, icons, EXIF-stripping image upload, **your keys** |
| `js/views/` | Shared chat engine, cards, polls, report dialog |
| `js/pages/` | landing, auth, home, explore, groups, group-create, **group-chat**, **group-info**, **profile**, **messages**, **notifications**, **settings**, invite, locked |
| `js/admin.js` | Platform dashboard: overview, report queue + investigation, users, moderation log, audit log |
| `supabase/01…05*.sql` | Tables, identity functions, messaging, moderation, RLS/storage/realtime |
| `supabase/06_make_admin.sql` | Grants admin (run once, by you) |
| `supabase/tests/rls_tests.sql` | 130 checks for anonymity, RLS, moderation, suspensions |

## How anonymity works

- **Three separate name spaces**: general (`User_839201`), one per group, one per private chat — all `User_` + random digits, unique.
- Mapping tables (account ↔ name) have **no API access at all**. The browser only calls audited `SECURITY DEFINER` functions that return the name for the current context.
- Group admins see group names only. Only platform admins can resolve a reported name → account, and each lookup is written to `audit_logs`.
- Private chats need an accepted request. Declined requests create nothing.
- Suspensions/bans are checked in the database on every call (and ban kills sessions), so refreshing or a new session doesn’t bypass them.

## Verified here

- SQL loads cleanly on Postgres 16 (with a Supabase-style `auth` shim); all 130 tests pass.
- All JS parses; every import/route resolves.
- Every page (app + admin) rendered at desktop and phone widths in Chromium against a **stubbed** Supabase client with no runtime errors.

**Not verified** (needs your real project): live email delivery, Realtime over WebSocket, Storage uploads, and the ban-kills-sessions step on `auth.sessions`. Test these once after setup with two accounts in two browsers.

## Known limits

- **Security headers**: `frame-ancestors` can’t be set from a `<meta>` tag. Set `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`) on your host.
- **Storage uploader**: Supabase records uploader IDs on storage objects. `05_security.sql` blanks it with a trigger *if your role is allowed to*; if the SQL Editor prints a notice that it couldn’t, uploads remain unlinkable from the app but not from the Supabase dashboard.
- **Network-level anonymity** (IP addresses) is outside the app. Supabase and your host see IPs.
- **Rate limits** are enforced in the database (messages, requests, reports, group creation, etc.). Add Supabase Auth rate limits and CAPTCHA (Authentication → Rate Limits / Attack Protection) before a public launch.
- Email is required for sign-up; admins can see it only while investigating a report.
