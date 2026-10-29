# Local testing — multi-country website + mobile app

Everything here runs on this machine only. It never touches naseebak.com, the old Neon database, real SMS or real
payments. Tested on Windows 10 with Git Bash, Node 22, pnpm 10.24, PostgreSQL 18 (local cluster on port 5434).

## 1. One-time setup

```bash
cd naseebak-main
git switch feature/multi-country-mobile
npx -y pnpm@10.24.0 install --frozen-lockfile

# A separate local database (the local cluster listens on 5434, user naseeb, no password)
psql -h localhost -p 5434 -U naseeb -d postgres -c "create database naseeb_mobile"

# Schema + seed. ALWAYS pass DATABASE_URL explicitly: the Prisma CLI otherwise reads .env (old Neon database)
export DATABASE_URL="postgresql://naseeb@localhost:5434/naseeb_mobile" DIRECT_URL="$DATABASE_URL"
export NODE_OPTIONS=--experimental-require-module
npx prisma db push && npx prisma generate
node prisma/seed.mjs                      # Jordanian test members + admin
node prisma/seed-countries.mjs --dev      # Jordan + Saudi Arabia settings, two Saudi test members (refuses non-localhost DBs)
```

### Environment overrides (git-ignored)
`.env.development.local` and `.env.production.local` override `.env` / `.env.local` (which point at Neon and hold real
SMS/email credentials). They set:

| Variable | Local value | Why |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | `postgresql://naseeb@localhost:5434/naseeb_mobile` | never the real database |
| `AUTH_URL`, `NEXT_PUBLIC_APP_URL` | `http://localhost:3020` | sign-in cookies and links |
| `AUTH_SECRET`, `CRON_SECRET` | random, local only | |
| `ALLOW_BUILTIN_TEST_PHONES` | `true` | built-in test numbers (fixed code) |
| `EXTRA_TEST_PHONES` | `0790000777,0500000777,0500000771,0500000772` | Jordan + Saudi test numbers |
| `SMS_MOCK` | `true` | every SMS goes to the local outbox |
| `PAYMENTS_MOCK` | `true` | checkout without Stripe |
| `BROADNET_*`, `UNIFONIC_*`, `SMTP_*` | blocked / empty | a real SMS or email can't leave this machine |

## 2. Run the website + API

```bash
npx -y pnpm@10.24.0 exec next dev -p 3020
```
- Jordan: http://localhost:3020 · Saudi Arabia: http://localhost:3020/sa
- Admin: http://localhost:3020/admin (`admin@naseeb.jo` / `Admin123!`, seed only) → **Countries**

## 3. Test accounts (code `111111`, no SMS)

| Country | Number | Who |
|---|---|---|
| Jordan | 0796922292 | سارة (woman, complete profile) |
| Jordan | 0777000001 / 0777000002 | built-in test members |
| Jordan | 0790000777 | not registered → test sign-up |
| Saudi Arabia | 0500000771 | ريم (woman, complete profile) |
| Saudi Arabia | 0500000772 | فهد (man, complete profile) |
| Saudi Arabia | 0500000777 | not registered → test sign-up |

Any other valid number receives a random code in the **mock outbox**:
`curl "http://localhost:3020/api/dev/sms-outbox?phone=0551234567"` (404 on real servers).

## 4. Mock checkout

With `PAYMENTS_MOCK=true`, `POST /api/payments/checkout` returns `{ mock: true, paymentId }`. Finish it with
`POST /api/dev/mock-checkout/{paymentId}` `{ "outcome": "paid" }` (signed in as the buyer) — credits are added through
the real `fulfilCheckoutSession`, exactly once. Saudi members get `403 PURCHASES_DISABLED` (prices not approved).

## 5. Scripted API check (what was actually run)

```bash
B=http://localhost:3020
curl -s -X POST $B/api/auth/send-otp -H 'Content-Type: application/json' -d '{"phone":"0500000772","context":"login"}'
curl -s -X POST $B/api/auth/verify-otp -H 'Content-Type: application/json' -d '{"phone":"0500000772","code":"111111"}'
curl -s -X POST $B/api/mobile/auth/token -H 'Content-Type: application/json' -d '{"phone":"0500000772","code":"111111"}'
# → { token, expiresAt, user } ; then
curl -s $B/api/mobile/me -H "Authorization: Bearer <token>"
curl -s -X POST $B/api/mobile/auth/logout -H "Authorization: Bearer <token>"
```
Verified on 2026-10-29: token issued, member routes accept it, admin routes refuse it (403), logout → 401, a used
code can't be reused, a new Saudi number gets its code in the mock outbox, a Jordanian number with `country: "SA"`
gets `COUNTRY_MISMATCH`.

## 6. Automated checks

```bash
export NODE_OPTIONS=--experimental-require-module
npx vitest run          # 1215 tests
npx tsc --noEmit
npx eslint .            # 0 problems (Marketing/ and naseebak_app/ are not part of the website lint)
npx -y pnpm@10.24.0 build   # webpack production build (as on the server)
```

## 7. Mobile app

See `naseebak_app/README.md`. The Android emulator reaches this machine at `http://10.0.2.2:3020`.

## 8. Scenarios

**Jordan:** open http://localhost:3020 → register with 0790000777 → finish the short setup → suggestions → «مهتم»
(1 credit) → payments (mock buy 10 credits) → admin → Countries shows Jordan members.

**Saudi Arabia:** open http://localhost:3020/sa (Saudi hero, «جوال», +966) → register with 0500000777 → setup shows
Saudi cities → suggestions only show Saudi members (ريم / فهد) → payments show packages as unavailable.

**Country isolation:** a Saudi member never sees Jordanian members or JOD prices; Jordanian packages, prices and
members are unchanged; admin → Countries → switching Saudi Arabia off hides it from `/api/countries` and sends `/sa`
visitors to the Jordan home, while existing Saudi members can still sign in.
