# Naseebak (نصيبك) — Go-Live Readiness Report

**Date:** 2026-10-06
**Scope:** Full review of the `naseebak-main` codebase before production launch.
**Method:** Five parallel reviews — security audit, domain-rule & privacy compliance, live end-to-end testing against a seeded test database, build & operations readiness, and product/SRS gap analysis. Every finding below was verified by reading the code or reproduced live; nothing was tested against production.

> **Verdict: NOT ready to go live.** The core user journey works end-to-end, but there are account-takeover, ID-document exposure, and broken-monetization issues that must be fixed first.

> ⚠️ This document describes unfixed vulnerabilities. Keep it internal until the Phase 1 items are resolved.

---

## 1. Summary

| Area | Status |
|---|---|
| Unit tests | ✅ 199/199 pass (13 files) — but all are pure unit tests; **0 API route tests** |
| TypeScript | ✅ 0 errors |
| Production build | ✅ Succeeds (106 pages) |
| Lint | ❌ Broken (`next lint` removed in Next 16; ESLint config crashes). With a working config: 59 errors, 103 warnings |
| Core flow (suggestion → interest → match → visit → feedback) | ✅ Works end-to-end |
| Auth on APIs | ✅ All user APIs reject anonymous (401); all admin APIs reject non-admins (403) |
| Ownership checks (IDOR) | ❌ Suggestion accept/reject and notification mark-read are open to any user |
| OTP / login security | ❌ Brute-forceable, reusable codes, production backdoor numbers |
| ID document privacy | ❌ Public CDN at guessable URLs |
| Business rules enforced server-side | ❌ Credits, 100% completeness, verification, suspension, profile review, 18+ — mostly UI-only |
| Payments | ⚠️ Charges USD not JOD; webhook can double-credit; credits never consumed |
| Dependencies | ❌ Next.js 16.1.6 and next-auth beta.30 have critical advisories (5 critical / 32 high in `pnpm audit --prod`) |
| Ops (CI, migrations, monitoring, backups) | ❌ None in repo |

**Counts:** 9 launch blockers · ~15 high · ~20 medium · many low.

---

## 2. Launch Blockers (must fix before go-live)

### B1. Account takeover via OTP brute force
- `src/app/api/auth/verify-otp/route.ts` has **no rate limit and no attempt counter**. Confirmed live: 8 wrong codes then the correct one → accepted.
- Codes are 6 digits, valid 5 min, generated with `Math.random()` (`send-otp/route.ts:143`).
- **Fix:** max 5 attempts per OTP (add `attempts` column, invalidate at limit); per-phone + per-IP limit on verify; `crypto.randomInt`. **Effort: S**

### B2. Verified OTPs are permanent passwords
- `src/lib/auth.ts:38-46` accepts any OTP row with `verified: true` — no expiry check, never consumed. Same in `register/route.ts`. Confirmed live: signed in with an old code without a new send/verify.
- **Fix:** require `expiresAt > now` and `consumedAt: null`; mark consumed on sign-in. **Effort: S**

### B3. Production backdoor: fixed OTP `111111` + seeded admin
- `src/app/api/auth/send-otp/route.ts:8-13` — three phone numbers always accept `111111`, no environment guard.
- Seed creates admin `admin@naseeb.jo` with a known password (documented in CLAUDE.md).
- **Fix:** gate test phones behind `NODE_ENV !== "production"` + explicit env flag; confirm seed accounts do not exist in production; rotate the admin password. **Effort: S**

### B4. Hardcoded SMS gateway credentials
- Broadnet username/password are in `send-otp/route.ts:25-26` and in `CLAUDE.md`, and sent in a GET query string.
- **Fix:** rotate the Broadnet password; move to env vars; remove from CLAUDE.md and purge from git history. **Effort: S**

### B5. Government ID scans publicly reachable
- Stored at `identity/{userId}/front.{ext}` on the public CDN (`identity/upload/route.ts:121,125`, `lib/bunny.ts:52`) with no token auth.
- Other users' internal `userId` is returned in `GET /api/suggestions`, `/api/interests/received`, `/api/matches` — so anyone shown a suggestion can construct the URL.
- Same pattern for avatars (`avatars/{userId}/avatar.{ext}`) → breaks "photos hidden until mutual like".
- **Fix:** private storage zone or Bunny token auth; admin-only proxy / signed URLs; random UUID paths; stop exposing internal user IDs; purge CDN cache. *Verify the current Bunny zone config to confirm exposure.* **Effort: L**

### B6. Suggestion accept/reject IDOR (confirmed live)
- `suggestions/[id]/like/route.ts:17-38` and `reject/route.ts:16` never check `recipientId === session.user.id` or `status === "PENDING"`.
- Live: Sara rejected Noor's suggestion (200) and accepted Lina's (200, sending an interest to Ahmad).
- A candidate can "like" their own incoming suggestion → self-match (`femaleId == maleId`) + junk visit request.
- **Fix:** `findFirst({ where: { id, recipientId: me, status: "PENDING" } })`; wrap like/match/visit in `db.$transaction`. **Effort: S**

### B7. Critical framework vulnerabilities
- `next@16.1.6`: unauthenticated RCE in Image Optimization (AVIF) — reachable since `next/image` is used with the CDN remote pattern and uploads aren't byte-checked; multiple middleware bypass / DoS / SSRF highs.
- `next-auth@5.0.0-beta.30`: auth checks can fail open on config errors.
- **Fix:** upgrade `next >= 16.3.3`, `next-auth >= 5.0.0-beta.32`, and `prisma`; re-run `pnpm audit`. **Effort: S–M**

### B8. Monetization does nothing
- `User.matchCredits @default(1)` (spec says 5 free). **No code anywhere decrements credits.** Generation and liking never check them. Paid credits have no effect.
- Stripe webhook (`payments/webhook/route.ts:43-55`) is not idempotent → retries double-credit. Checkout charges **USD** (`checkout/route.ts:50`), docs say JOD.
- **Fix:** decide what a credit buys; default 5; atomic conditional decrement inside the suggestion transaction; idempotent webhook (`updateMany where status: PENDING`, increment only if count === 1); charge JOD (fils = ×1000); one shared package catalogue. **Effort: M**

### B9. No migrations, CI, or versioned ops
- `prisma/migrations/` is gitignored; production schema changes via `db push`.
- No `.gitlab-ci.yml`, deploy script, PM2 or nginx config in repo.
- **Fix:** baseline migrations, `prisma migrate deploy` in deploy; GitLab CI (install → tsc → lint → test → build); version deploy/PM2/nginx configs. **Effort: M**

---

## 3. High Priority (fix before launch if at all possible)

| # | Issue | Where | Fix |
|---|---|---|---|
| H1 | **Suspension doesn't revoke sessions** — confirmed live: suspended user keeps full access (JWT lives 30 days) | `lib/auth.ts:120-126` `requireUser` | Re-check status/isDeactivated/isVerified from DB (short cache); shorter `maxAge` |
| H2 | **Identity verification not enforced on APIs** — no route checks `isVerified` | all user routes | `requireVerifiedUser()` helper for matching routes |
| H3 | **100% completeness not enforced** — users at 84% got suggestions; `PUT /api/profile` sets `isComplete=true` blindly | `admin/suggestions/generate/route.ts:19`, `profile/route.ts:122,153` | Use `calculateCompleteness()` server-side in generator and user routes |
| H4 | **Profile admin-review bypass** — `PUT /api/profile` and `PATCH /api/profile/draft` write steps 1-4 directly any time | `profile/route.ts:65-155`, `profile/draft/route.ts` | Reject once profile complete; force `update-request` path |
| H5 | **No 18+ check** anywhere on a marriage platform | `validations/profile.ts:4` | Zod refine age ≥ 18; admin DOB-vs-ID check |
| H6 | **Matching preferences broken** — UI saves "نعم/لا/لا يهم", scorer compares to `"yes"` → hijab/beard preference inverted; "no children" preference ignored | `lib/matching/score.ts:206,212,219` | Map Arabic values; treat "لا يهم" as no-preference; tests with real UI values |
| H7 | **Suspended/flagged users still suggested** | `generate/route.ts:14-20`, `candidates/route.ts` | Filter `status: VERIFIED`, `isFlagged: false`, not pending deletion |
| H8 | **Admin visit notes leaked to users** — `visit-status` returns whole row incl. `adminNotes` | `matches/[id]/visit-status/route.ts:18,29` | `select: { status, scheduledDate }` |
| H9 | **Phone-number enumeration** — `send-otp` returns `userExists` | `send-otp/route.ts:112-116,165-168` | Uniform response |
| H10 | **Notification mark-read IDOR** — confirmed live | `notifications/[id]/read/route.ts:24` | Add `userId` to where |
| H11 | **Rate-limit bypass via spoofed `X-Forwarded-For`** — confirmed live; enables SMS bombing | `send-otp/route.ts:62`, `lib/rate-limit.ts` | Use nginx-set `x-real-ip`; DB/Redis-backed limiter; cover verify-otp, register, checkout, uploads, reports |
| H12 | **Free-text contact channel** — `aboutMe`, `familyValues`, hobbies shown pre-match, unfiltered and editable without review | `suggestions/route.ts:116-129` | Strip/reject phone numbers, URLs, @handles, "واتس"; review first-time bios |
| H13 | **Tracking pixels on dashboard** — Meta Pixel / GTM load on private marriage-profile pages | `components/shared/tracking-scripts.tsx` in `(ar)/layout.tsx` | Load only on marketing pages, after consent |
| H14 | **No error monitoring / no error pages** — 187 `console.error`, no Sentry; no `error.tsx`, `not-found.tsx`, `global-error.tsx` | `src/app` | Add Sentry + Arabic error/404 pages |
| H15 | **No security headers** (CSP, HSTS, X-Frame-Options…) | `next.config.ts` | Add `headers()` or nginx config; verify on prod |
| H16 | **Upload has no size limit / byte check** | `identity/upload/route.ts` | 5MB cap (+ nginx `client_max_body_size`), verify magic bytes, re-encode with sharp |

---

## 4. Medium Priority

**Legal / PDPL (Jordan Personal Data Protection Law No. 24 of 2023)**
- No consent captured at registration (no terms/privacy checkbox, no timestamp); sensitive data (health, religiosity, tribe) mandatory without explicit consent.
- Privacy policy promises things not built: data export, OTP auto-deletion, inactive-account deletion, limited card fields.
- Payments cascade-delete with the user, contradicting "we retain financial records".
- ID images retained indefinitely after approval.
- Pre-match cards show tribe + area + family origin + job + skin colour + weight — enough to re-identify someone in a small community; contradicts SRS FR-008 and the privacy page. **Needs a product decision.**
- No admin audit log, although admins see IDs and guardian phones.

**Public claims**
- Landing page hard-codes "480+ successful marriages", "93% match accuracy", testimonials.
- FAQ advertises monthly plans that don't exist (also breaks "no pricing on landing").
- Matching is a rule-based scorer marketed as "AI".

**Account state**
- Deactivated users and users in the 30-day deletion grace period **cannot log in** to reactivate/cancel (contradicts SRS FR-004).
- Unsuspend always sets `VERIFIED`, even for never-verified users.
- Rejecting an already-approved ID leaves `isVerified=true`.
- Admin manual suggestion has no validation (same-gender / self / unverified pairs possible).

**Robustness (from live tests)**
- Malformed JSON → 500 on all 21 body-taking routes (should be 400).
- Nonexistent IDs → 500 instead of 404 (8 routes); `?page=abc` → 500 on all lists (`lib/utils.ts:9`).
- Double-accept of a suggestion → 500 after partially writing.
- Profile update request `changes` never validated → admin approve crashes with 500; no size limit (2M-char `aboutMe` accepted).
- Checkout inserts a PENDING payment before calling Stripe → orphan rows on failure.
- Registration names: no max length; tatweel/punctuation-only names pass.

**Performance / scale**
- Suggestion generation is O(n²), loads everyone into memory, sequential inserts inside one HTTP request → will time out as users grow. Move to a scheduled background job with `createMany`.
- ~33 of 54 `findMany` calls unbounded; missing DB indexes on hot columns (`Notification.userId/isRead` is polled every 30s per user, `Payment.userId`, `Photo.userId`, `Suggestion.candidateId`, `Like.toUserId`, etc.).
- All 41 pages are `"use client"`; blog body fetched client-side → poor SEO. Sitemap frozen at build time.

**Matching quality**
- Personality cosine on raw 1–5 vectors gives ~0.8–1.0 for everyone (`[1,1,1,1,1]` vs `[5,5,5,5,5]` = perfect match). Centre vectors (subtract 3) or use distance.
- Score threshold 30 filters almost nothing; all preferences are soft (age/marital status can be violated). Add hard filters for explicit preferences.
- No fairness/exposure control — popular profiles get flooded, others never suggested. Cap per-candidate appearances, expire stale suggestions.
- No scheduler for generation (manual admin button only).

---

## 5. Low Priority

- `payments/session-status` doesn't check session ownership.
- Cron secret passed in query string (lands in access logs) — use a header; deletion cron not actually scheduled.
- Phone numbers logged in `send-otp`.
- Reports auto-flag after 3 reports from any accounts → abuse vector.
- Blog JSON-LD doesn't escape `</script>`.
- `parent-info` POST skips its existing `parentInfoSchema`.
- `willingToRelocate` silently dropped on profile-request approval.
- 15 raw `<img>` tags; `/blog/<missing>` returns 200 (soft 404); hardcoded production URL in admin support push.
- Deprecated `middleware.ts` → rename to `proxy.ts`.
- README is GitLab boilerplate; no `engines`/`.nvmrc` (Node ≥ 22.12 required).
- `@neon/config`, `@neon/env` added to prod dependencies during local setup — move to devDependencies or remove.

---

## 6. Recommended Launch Plan

### Phase 1 — Security blockers (≈ 1 week)
1. OTP: attempt limits, rate-limit verify-otp, consume codes, expiry, `crypto.randomInt`, uniform response (B1, B2, H9)
2. Remove test-phone backdoor; verify/delete seed accounts in prod; rotate admin + Broadnet credentials; move secrets to env (B3, B4)
3. Fix suggestion and notification IDORs; transactions in like/accept flows (B6, H10)
4. Upgrade Next.js, next-auth, Prisma (B7)
5. Re-check user status on every request (H1, H2)
6. Trusted client IP for rate limiting (H11)

### Phase 2 — Privacy & business rules (≈ 1–2 weeks)
1. Private ID storage + random avatar paths + stop exposing user IDs (B5)
2. Credit model + idempotent webhook + JOD currency (B8)
3. Server-side enforcement: completeness, verification, profile review, 18+, eligibility filters (H3–H7)
4. Fix matching preference mapping (H6)
5. Hide admin notes; free-text contact filter; tracking only on marketing pages (H8, H12, H13)
6. Consent at registration; align privacy policy/FAQ/landing claims with reality

### Phase 3 — Operational readiness (≈ 1 week, parallel with Phase 2)
1. Prisma migrations baseline; GitLab CI; versioned deploy/PM2/nginx configs (B9)
2. Sentry + structured logging with PII redaction; Arabic error/404 pages (H14)
3. Security headers; upload limits (H15, H16)
4. Health endpoint, uptime monitoring, Neon PITR/backup verification, staging environment
5. DB indexes; paginate unbounded queries; schedule generation & deletion jobs
6. API route tests for auth, OTP, webhook, IDOR, admin authorization

### Soon after launch
- Admin audit log, roles/permissions, admin 2FA
- Self-reactivation / deletion cancellation flow
- Visit workflow: assigned admin, timeline, append-only notes, overdue alerts
- Local payments (CliQ manual flow → eFAWATEERcom), receipts/invoices
- Matching quality: centred personality vectors, hard filters, fairness caps, suggestion expiry
- SMS notifications for identity result, mutual match, visit scheduled
- Analytics funnel (registered → verified → 100% → suggested → matched → visit → proceeded)
- Server-render marketing/blog pages for SEO

### Later
- Learn matching weights from accept/reject and visit outcomes (to back the "AI" claim)
- Guardian/family involvement features (guardian notifications, wali approval before visits)
- Trust signals (verified badge, activity indicator), fraud detection (duplicate IDs/photos/devices)

---

## 7. What's Working Well

- Complete core flow verified live: suggestion → interest → mutual match → admin-arranged visit → feedback, with correct notifications and routing.
- Every admin API enforces `requireAdmin()`; admin passwords use bcrypt (cost 12); admin login is rate-limited.
- Ownership correctly checked on match photos, visit status, visit feedback, interest accept/reject, photo/block/notification delete.
- No photos, phone, email, last name, or guardian data in pre-match or post-match API responses (except via the CDN URL issue in B5).
- Stripe webhook verifies signatures; prices come from the server.
- No raw SQL, no `dangerouslySetInnerHTML` on user content, no path traversal in uploads.
- Clean TypeScript, passing build, good Arabic RTL metadata/SEO scaffolding (Open Graph, JSON-LD, sitemap, robots).
- Many useful features beyond the SRS: blog CMS, support tickets, reports/blocks, referrals, deletion grace period, visit feedback, registration toggle.
