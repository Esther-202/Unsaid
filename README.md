# UNSAID — There’s more to say when nobody knows it’s you.

Anonymous communities + private chats. Plain HTML/CSS/JavaScript (no build step) on Supabase.

## Setup (≈10 min)

1. **Create a Supabase project** (supabase.com → New project).
2. **Create the database**: Dashboard → SQL Editor → paste `supabase/unsaid_all_in_one.sql` → Run.
   - Or run separately, in order: `01_schema` → `02_core_functions` → `03_messaging_functions` → `04_moderation_functions` → `05_security` → `07_upgrade`.
   - **Already have 01–05 installed?** Run `07a_limits.sql`, then `07b_usernames_suggestions.sql`, then `07c_security.sql` (small files, safe to repeat; `07_upgrade.sql` is the same three in one file). It adds the limits, the new usernames, the suggestion box and the security features, and keeps all existing data.
   - **Cleaner Alerts.** Run `09_alerts.sql` once (safe to repeat, independent of 08). Messages, replies and reactions now roll up into one card per chat or group with a count ("5 new messages"), and opening the chat clears its card.
   - **Keys, backup and voice notes.** Run `10_keys_voice.sql` once, after 08 and 09 (safe to repeat). Each person's app now makes a master seed and a stack of one-time public keys on first launch, so a private chat can be used while the other person is offline. Signing in with your password automatically saves the seed, encrypted in the browser with that password (no extra steps; signing in on a new device unlocks your chats by itself). Settings → *Private chat keys & backup* can switch this to a recovery code or passphrase (stronger), so a new phone or laptop can restore older private messages. Private chats also get permission-based, end-to-end encrypted voice notes (a private storage bucket `dm-voice` is created by the SQL; if it reports a storage permission notice, create a private bucket named `dm-voice` in Dashboard → Storage). Old chats made before this keep their device-only keys.
   - **Home Screen app + push notifications.** The site is now installable (manifest, icons). For notifications when the app is closed: run `11_push.sql`; in Supabase → Edge Functions create a function named `send-push` and paste `supabase/functions/send-push/index.ts`; add secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:you@example.com`); then Database → Webhooks → create one on table `notifications` for Insert and Update that calls the `send-push` Edge Function. The public key in `js/push-config.js` must match `VAPID_PUBLIC_KEY`. Pushes carry only generic text, never message content, names or group names. On iPhone, notifications need iOS 16.4+ and the site added to the Home Screen.
   - **Private chats are end-to-end encrypted.** After 07c, run `08_e2ee.sql` once (safe to repeat). Messages are locked in the browser; the server only stores scrambled text. Photos are not available in private chats. Each chat's key lives on the device where it was opened: a new browser or cleared data means older messages in that chat can't be opened (use "Start fresh"). The security code in the chat menu lets two people check nobody swapped keys.
   - Re-run `05_security.sql` any time you change a function or table.
3. **Auth settings** (Dashboard → Authentication):
   - Providers → Email: enable, keep **Confirm email** ON.
   - URL Configuration → **Site URL** and **Redirect URLs**: add the address you host the app at (e.g. `http://localhost:8080/` while testing).
4. **Connect the app**: open `js/config.js`, paste **Project URL** and **anon key** (Project Settings → API). Never use the `service_role` key.
5. **Run it**: serve the folder with any static server, e.g. `python3 -m http.server 8080` then open `http://localhost:8080`.
6. **Make yourself platform admin**: register in the app, confirm your email, then edit the email in `supabase/06_make_admin.sql` and run it. Open `/admin.html` (not linked anywhere in the app).
7. **Check it** (optional): run `supabase/tests/rls_tests.sql` in the SQL Editor. It rolls back and ends with `ALL TESTS PASSED`.

## Settings to switch on in Supabase (Dashboard)

| Where | Setting | Why |
|---|---|---|
| Authentication → Sign In / Providers → Email | **Confirm email: ON** | Accounts stay inactive until the email is verified (the database also refuses unverified accounts) |
| Authentication → Sign In / Providers → Email | **Email OTP / link expiry: 3600 seconds** (1 hour) | Verification links expire quickly |
| Authentication → Sign In / Providers | **Prevent use of leaked passwords**, minimum length 8 | Stronger passwords |
| Authentication → Rate Limits | Lower sign-ups / sign-ins per hour | Slows mass registration and password guessing |
| Authentication → Attack Protection | **CAPTCHA** (Turnstile or hCaptcha) | Stops bots creating accounts |
| Authentication → Sessions | Optional: *inactivity timeout* / *time-box* (paid plans) | Persistent login stays on by default (refresh tokens); this sets how long |
| Authentication → URL Configuration | Site URL + Redirect URLs = your live address | Verification and reset links open the right place |
| Project → Advisors | Run **Security** and **Performance** advisors | Catches mistakes before launch |

Persistent login: Supabase keeps people signed in with a refresh token stored by the browser, so closing and reopening the site does not ask for a password again. Logging out ends that login on the server (this device only). Passwords are never stored in the browser.

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
| `supabase/07_upgrade.sql` | One upgrade for existing databases: usage limits (5 new private chats / 12 h, 3 groups per person, 3 new groups / day) · SilentMoon27-style usernames (existing users migrated) · suggestion box · verified-email gate · login-session tracking & suspicious-activity flags |
| `supabase/tests/` | `rls_tests.sql` (130 checks: anonymity, RLS, moderation) · `limits_tests.sql` · `upgrade_tests.sql` (usernames, suggestions, verified email, sessions, flags) |

## How anonymity works

- **Three separate name spaces**: general (e.g. `SilentMoon27`), one per group, one per private chat — each a random Adjective + Noun + number, unique, and never derived from any personal information.
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
- **Network-level anonymity** (IP addresses) is outside the app. Supabase and your host see IPs. The app itself loads no third-party code or fonts (Inter and supabase-js are self-hosted in `assets/fonts` and `js/vendor`), so no other company sees visitors' IPs. Links that users post open other sites, which see the IP of whoever clicks.
- **Rate limits** are enforced in the database (messages, requests, reports, group creation, etc.). Add Supabase Auth rate limits and CAPTCHA (Authentication → Rate Limits / Attack Protection) before a public launch.
- Email is required for sign-up; admins can see it only while investigating a report. Verifying an email proves control of that inbox, not a person's identity, and the app never claims otherwise.
- **Sessions & flags**: the app records the browser family, system and device type of each login (no IP addresses, no fingerprinting). Flags are signals for a human to review; nothing is punished automatically, because a phone plus a laptop is normal.


## Today (answers, mood, unsent letters, streaks)
Run `supabase/12_today.sql` (it is already inside RUN-THIS-IN-SUPABASE.sql). Pages: `#/today`, `#/letters`; the Home card shows today's question, mood and your streak. Everything is anonymous; a "day" is the UTC day. Three different people reporting an item hides it; admins review it under "Today & letters". Tests: `supabase/tests/today_tests.sql`.
