# Member rules

Domain rules, sign-in, schema notes and small site switches.

> Reference detail moved out of `CLAUDE.md` on 2026-11-06. If this file and `CLAUDE.md` differ, `CLAUDE.md` wins.

## Domain rules

- **No messaging/chat/communication** between users — except the in-app chat of the new cycle (below): only after a mutual match **and** an accepted chat request, text only, filtered
- **New user cycle is behind switches** (`intro_requests_enabled`, `chat_enabled`, `new_suggestions_flow`, `credit_on_interest`, default off) — when off, the site behaves exactly as the legacy flow. Live site: every schema change must stay additive
- **Photos hidden** until mutual like
- **Gender-neutral access** — same workflow for all users
- **Identity verification removed for users** (Oct 2026): no `/dashboard/identity` page or `/api/identity/*` routes (`/dashboard/identity` redirects to `/dashboard`). Existing `IdentityDoc` data is kept; `VerifiedBadge` shows "موثّق" only for already-verified users and renders nothing otherwise. Admin Identity Review page stays for pending docs
- **Members are 18+:** `dateOfBirthError()` / `maxDateOfBirth()` in `src/lib/validations/profile.ts` (profile + draft schemas, setup/edit wizards, update requests)
- **Birth date input:** setup and edit use `BirthDateSelect` (`src/components/profile/birth-date-select.tsx`, helpers in `src/lib/birth-date.ts`): day / month / year lists, years 18–80 years back, value still `YYYY-MM-DD` ("" while incomplete). Not `<input type="date">`: in Instagram's Android in-app browser a member couldn't enter her date and never got past setup step 1 (ticket 2026-11-03)
- **Profile text limits** (`validations/profile.ts`, shown on other members' cards): short fields ≤ 100, long texts ≤ 500, lists ≤ 30 items, in the profile and draft schemas; `POST /api/profile/update-request` validates `changes` with `profileUpdateChangesSchema` (built from `profileDraftFields`: unknown keys refused, wizard enums, numeric strings / "" / null accepted, birth date checked whatever its type) and `message` ≤ 1000
- **Guardian contact is validated** with `parentInfoSchemaFor(country)` (Arabic name, a mobile of the member's own country, stored normalised, never the user's own number) in `/api/profile/parent-info` and both wizards
- **Short onboarding:** the setup wizard (and `profileSchema`) requires only birth date, nationality, city, education, marital status (+children if not single), religiosity and partner age range; everything else is optional ("(اختياري)").
  - **No guardian at setup in the new cycle** (owner decision 2026-10-18, most sign-ups dropped there): the wizard has 4 steps (legacy keeps step 5), and the guardian is asked for only when needed — `GuardianQuickForm` (`src/components/intro/guardian-quick-form.tsx`; the dialogs pass `shareConsent={false}`: it saves only the contact and the action records the consent once it goes through) inside `InterestDialog` (FAMILY), `IntroConfirmDialog` (send/accept family, chat → family) and the mixed-match share prompt (saves, then shares).
  - The server still refuses every family step without one (`GUARDIAN_REQUIRED`).
  - `missingSetupSteps()` (`profile-completeness.ts`) names the required steps left on the suggestions page and the next-step card.
  - The wizard keeps yes/no answers (hijab, beard, driving licence) null until answered — never a default `false`
- **Option labels per gender** (`src/lib/profile-options.ts`): stored values never change (`"ملتزم"`, `"لا أدخن"`, `"مهندس"`); show `selfLabel()` for my own profile (feminine for women) and `describeOption()` / `partnerOptions()` when describing someone else (third person)
- **Suggestion gate:** always use `meetsSuggestionGate(user, newCycle)` (server) / `qualifiesForSuggestions()` (client) from `src/lib/profile-completeness.ts` — new cycle: a finished short setup (`profile.isComplete`) is enough; legacy: ≥50% (`SUGGESTIONS_MIN_COMPLETENESS`). Matches are never gated (not even by the optional quiz)
- **Parent/guardian data** visible to admin only — except name/relationship/phone shown to the other family after an **accepted family introduction**, and only if that user consented (`ParentInfo.shareConsentAt`)
- **Credits, per-request mode (`intro_requests_enabled` on, `credit_on_interest` off):** suggestions are free (3 per rolling 7 days, `WEEKLY_FREE_SUGGESTIONS`); each family/chat request costs the sender 1 credit, never refunded; new users get 3 (`getRegistrationCredits()`). One-time top-up: `node scripts/new-cycle-migrate.mjs` right after turning the switch on
- **Suggestion credits (legacy, switch off):** new users get 2 (`FREE_MATCH_CREDITS` in `src/lib/credits.ts`). Each suggestion received uses 1 credit (`reserveCredits`, atomic) — auto-suggest and admin Generate only create as many as the balance allows; admin hand-picked suggestions are free. At 0 the user gets a PAYMENT notification and a recharge alert (dashboard + suggestions page). Packages in `/dashboard/payments` (`src/lib/payments/packages.ts`)
- **No credit gate on matches** — mutual match details always fully visible (with `credit_on_interest` the match itself is free too; the credit is spent earlier, on "مهتم")
- **No pricing on landing page** — packages only in dashboard payments
- **Suggestion/match cards** show full expandable profile details and a `VerifiedBadge` (only for already-verified users) from `User.isVerified`; the badge is hidden while `intro_requests_enabled` is on, so it is hidden on production

## Auth

Dual auth: phone+OTP for users, email+password for admins. Providers in `src/lib/auth.ts`: `"credentials"` (phone+OTP) and `"admin-credentials"` (email+password).

- **User flow:** `POST /api/auth/send-otp` → `POST /api/auth/verify-otp` → `signIn("credentials")` or `POST /api/auth/register`.
- A verified code finishes sign-in/registration only within 30 minutes of being sent (`VERIFIED_OTP_WINDOW_MS`) and sign-in uses it up (deletes verified codes); `verify-otp` allows 5 tries per phone (then the code is deleted) and 30 per IP per 15 min.
- A failed SMS returns 502 (never "code sent").
- Sign-up never reveals whether a number is registered: `send-otp` with `context: "register"` always sends the code and answers the same (no `userExists`; with registration closed every number gets 403); only a verified code does — `POST /api/auth/register` → 409 `PHONE_EXISTS`, and the register page then signs the member in with that code (else `/login?exists=true`).
- The login context still returns `userExists` (the login page uses it to send new numbers to register).
- User email = `phone_${phone}@naseeb.local`.
- Names (`arabicNameField` in `src/lib/validations/auth.ts`): trimmed, inner spaces collapsed, Arabic only, ≥ 2 Arabic letters, ≤ 40 chars (`NAME_MAX_LENGTH`).
- Sign-up needs one required tick (terms + privacy + 18 or older, `termsAccepted: true`) stored as `User.termsAcceptedAt`.
- Login honours a same-site `callbackUrl` (`safeCallbackPath()` in `src/lib/safe-redirect.ts`; other hosts, auth pages and API routes → `/dashboard`).

**Admin:** `signIn("admin-credentials", { email, password })` → bcrypt verify → `/admin`. Seed (local only): see `prisma/seed.mjs`. Production uses a random password kept in `/root/.naseebak-admin-pass` on the server — never run the seed against production.

**Route protection** (`src/lib/auth.config.ts`, run by `src/proxy.ts` — Next 16 name for middleware): `/admin/*` → admin role required. `/dashboard/*` → auth required. `/login`, `/register` → redirect if logged in.

## Database schema

41 models in `prisma/schema.prisma`. Key points:
- `User.phone` stored as `962XXXXXXXXX`. `normalizePhone()` converts input formats
- `User.email` = `phone_962xx@naseeb.local` for users, real email for admins
- `User.passwordHash` optional — set for admins only (bcrypt)
- `Suggestion` uses `recipientId`/`candidateId` (mapped to `femaleId`/`maleId` DB columns via `@map`)
- `MutualMatch` `femaleId`/`maleId` — assigned dynamically based on actual genders
- `SystemSetting` — key-value store, read via `src/lib/settings.ts` (30s cache)
- `ProfileUpdateRequest` — user profile edits require admin review (steps 1-4) except partner preferences (`pref*`), which `/api/profile/update-request` saves directly (then `refreshOpenSuggestionsInBackground`: rescore, close cards that break a dealbreaker or fall under the minimum, top up), and filling a still-empty field (`splitProfileEdit()` in `src/lib/profile-edit-split.ts` → `PUT /api/profile`).
  - Preferences, fills and step 5 guardian info stay editable while a review is pending; only another change to a stored value is refused (409 `REQUEST_PENDING`, checked before anything is written).
  - «سحب الطلب» = `POST /api/profile/update-request/withdraw` (status `WITHDRAWN`).
  - Every new request emails the admins (`sendAdminAlert`, best effort), like new support tickets
- `Notification` has `@@index([userId, createdAt])` and `@@index([userId, isRead])` (2026-10-19; deploy with `--db-push`)
- `MutualMatch` follow-up: `femaleOutcome`/`maleOutcome` (`MatchOutcome` CONTINUING | NOT_A_MATCH | ENGAGED) + `…OutcomeAt`, `followUpCount`/`followUpSentAt`, `guardianShareRemindedAt` (see "Family introduction follow-up")

## Profile completeness weights

| Section | Weight |
|---------|--------|
| Basic info (10 fields) | 35% |
| Preferences (7 fields) | 25% |
| Personality quiz | 15% |
| Photos (≥1) | 15% |
| Family & Guardian | 10% |

## Contact page

`/contact` posts to `POST /api/contact` (`contactSchemaFor(country)` in `src/lib/validations/contact.ts`: a mobile of the visitor's country or an email, at least one; honeypot `website`, 5/hour per IP, 3/hour per email / phone) → `ContactMessage` row (`phone` stored normalised) (additive table `contact_messages`) + best-effort admin email (`sendContactNotification`). Read and mark handled in Admin → Contact Messages (`/admin/messages`). Footer social icons show only for the `NEXT_PUBLIC_SOCIAL_*` env vars that are set.

## Registration toggle

`SystemSetting` key `registration_open`. Default: open (fail-open on error). When closed: banner on landing pages, register page shows alert, `send-otp` blocks new phones, `register` returns 403.

## Maintenance mode

Admin → Settings → Maintenance Mode (`SystemSetting` keys `maintenance_mode`, `maintenance_message`; API `/api/admin/settings/maintenance`). When on, `src/app/(ar)/layout.tsx` renders `MaintenanceScreen` for everyone except admins (admins see the site + an amber banner); `send-otp` and `register` return 503. Admin panel, APIs and the Stripe webhook keep working. The layout calls `connection()` so all `(ar)` pages render per request. Takes effect within 30s (settings cache).

## Email and OneSignal limits

- Email is admin-only: `src/lib/email.ts` (Hostinger SMTP, env `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`) sends new-registration, contact and alert emails to the country's list in Admin → Countries, else `ADMIN_NOTIFY_EMAIL`. No emails to users
- OneSignal requires domain config in dashboard (Site URL: `https://naseebak.com`)
