# New cycle (phases 1–3) Implementation Plan

> **Historical document.** It records a decision or plan at the time it was written. The live behaviour has changed since. The current rules (as of 2026-10-17) are in `CLAUDE.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship per-request credits (3 free), family-introduction and chat requests on mutual matches, and an Ably-backed in-app chat, all behind off-by-default switches, without breaking the 200 live users.

**Architecture:** Business rules live in small server libraries (`src/lib/intro/*`, `src/lib/chat/*`, `src/lib/notify.ts`) unit-tested with a mocked `db` (the pattern in `src/__tests__/matching/auto-suggest.test.ts`). Thin API routes call them. UI is new self-contained components dropped into the existing pages. Ably only carries events; Postgres is the source of truth.

**Tech Stack:** Next.js 16 app router, Prisma 7 + `@prisma/adapter-pg`, NextAuth 5 (`requireUser`/`requireAdmin`), shadcn/ui + Tailwind v4 tokens, OneSignal REST, `ably` (new), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-16-new-cycle-design.md`

## Global Constraints

- Schema changes are additive only: no dropped/renamed columns, tables or enum values.
- Switch keys and defaults: `intro_requests_enabled = "false"`, `chat_enabled = "false"`.
- Free credits at registration: 3 when `intro_requests_enabled` is on, else 2; a request costs 1 credit from the sender; never refunded. A declined request is final for that type on that match; an expired one may be re-sent (paid).
- Request expiry 7 days; chat 14 days, one extension of 7 days, allowed in the last 3 days; expiry warning at 2 days left.
- Suggestions in per-request mode: free, max 3 created per recipient per rolling 7 days.
- Chat: text only, `body` 1–1000 chars, 50 messages/day and 5 per 5 seconds per user (filter runs before the limits); push throttle 1 per conversation per recipient per 3 minutes; no in-app Notification row per message.
- Ably channel name `chat:<conversationId>`; browser tokens are subscribe-only; only the server publishes.
- Colours: brand tokens only (`primary`, `secondary`, `accent`, `muted`, `destructive`; `emerald-/green-` success, `amber-` pending). No `blue-`, `gray-`, `rose-` etc.
- User-facing copy in Arabic; RTL; `ChevronRight` = السابق, `ChevronLeft` = التالي.
- Errors from API routes: `{ error: string }` in Arabic, matching existing routes.
- Admin UI in English.

## Review Focus

1. Two quick taps on "send request" (double submit) → only one request and one credit taken. Test in Task 5 (`reserveCredits` before create; second call sees the pending request → 409 without charging).
2. A user who is not part of the match calls the intro/chat APIs with a guessed id → 404, nothing leaked. Tests in Tasks 5 and 9.
3. Legacy matches with an admin visit in FAMILIES_CONTACTED/SCHEDULED → family button hidden, chat allowed. Test in Task 5 (`getMatchIntroState`).
4. Phone number written to dodge the filter (Arabic-Indic digits, spaces, dashes, "صفر سبعة") → blocked. Tests in Task 8.
5. Switches off → every new API returns 404 and the site behaves as today; turning a switch off mid-chat makes chats read-only rather than erroring. Tests in Tasks 5 and 9.

---

## File map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | New enums/models/fields (Task 1) |
| `src/lib/settings.ts` | `getCycleFlags()` |
| `src/lib/notification-links.ts` | type/metadata → URL |
| `src/lib/notify.ts` | single notification + push entry point |
| `src/lib/onesignal.ts` | add `collapseId` |
| `src/lib/credits.ts` | 3 free credits, per-request wording |
| `src/lib/matching/auto-suggest.ts`, `src/app/api/admin/suggestions/generate/route.ts` | per-request mode |
| `scripts/new-cycle-migrate.mjs` | one-time credit top-up + notice |
| `src/lib/intro/requests.ts` | intro request rules |
| `src/lib/intro/errors.ts` | `IntroError` |
| `src/lib/chat/filter.ts` | message filter |
| `src/lib/chat/service.ts` | conversations + messages rules |
| `src/lib/ably.ts` | publish + token |
| `src/app/api/matches/[id]/intro/route.ts`, `src/app/api/intro-requests/[id]/respond/route.ts`, `src/app/api/profile/guardian-consent/route.ts`, `src/app/api/me/counts/route.ts` | intro APIs |
| `src/app/api/chats/**` | chat APIs |
| `src/components/intro/*` | match intro panel, dialogs, guardian card, consent card |
| `src/components/chat/*` | chat list, room, bubbles, composer, `use-chat-channel` hook |
| `src/app/(ar)/dashboard/chats/page.tsx`, `.../chats/[id]/page.tsx` | chat pages |
| `src/app/api/admin/settings/new-cycle/route.ts`, `src/app/api/admin/introductions/route.ts`, `src/app/(en)/admin/introductions/page.tsx` | admin |

---

### Task 1: Additive schema

**Files:** Modify `prisma/schema.prisma`.

- [ ] Add enums `IntroRequestType {FAMILY CHAT}`, `IntroRequestStatus {PENDING ACCEPTED DECLINED EXPIRED CANCELLED}`, `ConversationStatus {ACTIVE ENDED EXPIRED}`; add `INTRO_REQUEST`, `CHAT` to `NotificationType`.
- [ ] Add models `IntroRequest` (`@@map("intro_requests")`), `Conversation` (`@@map("conversations")`, also `expiryWarnedAt DateTime?`), `Message` (`@@map("messages")`) exactly as in the spec, with back-relations on `User` (`sentIntroRequests`, `receivedIntroRequests`, `messages`) and `MutualMatch` (`introRequests`, `conversation`).
- [ ] Add `ParentInfo.shareConsentAt DateTime?`, `NotificationPreference.introRequests` and `.chatMessages` (`Boolean @default(true)`). Leave `User.matchCredits` default unchanged.
- [ ] Run `npx prisma validate && npx pnpm@10.24.0 db:push` → "Your database is now in sync". Existing rows unchanged (`select count(*) from users` same as before).
- [ ] Commit `feat(db): additive schema for intro requests and chat`.

### Task 2: Switches + notification foundation

**Files:** Modify `src/lib/settings.ts`, `src/lib/onesignal.ts`, `src/lib/validations/notification-preferences.ts`, `src/app/api/notifications/[id]/read/route.ts`, `src/app/(ar)/dashboard/notifications/page.tsx`, `src/lib/notification-helper.ts` (delegate to `notify`). Create `src/lib/notification-links.ts`, `src/lib/notify.ts`. Test `src/__tests__/notify.test.ts`, `src/__tests__/notification-links.test.ts`.

**Interfaces — Produces:**
- `getCycleFlags(): Promise<{ introRequests: boolean; chat: boolean }>` — `chat` is true only if both keys are "true".
- `notificationUrl(type: string, metadata?: unknown): string` — `metadata.url` (string starting with `/`) wins, else map: SUGGESTION/INTEREST → `/dashboard/suggestions`, MATCH/VISIT_UPDATE/INTRO_REQUEST → `/dashboard/matches`, CHAT → `/dashboard/chats`, PAYMENT/SUBSCRIPTION → `/dashboard/payments`, IDENTITY → `/dashboard/identity`, SUPPORT → `/dashboard/support`, SYSTEM/other → `/dashboard`.
- `notify(input: { userId: string; type: NotificationType; title: string; body: string; url?: string; metadata?: Record<string, unknown>; pushOnly?: boolean; collapseId?: string }): Promise<void>` — unless `pushOnly`, creates the Notification row with `metadata: {...metadata, url}`; sends push only when the preference for the type is on (missing row = on; SYSTEM always; INTRO_REQUEST→`introRequests`, CHAT→`chatMessages`). Never throws.
- `notifyMany(userIds: string[], input: Omit<NotifyInput,"userId">): Promise<void>`.
- `sendPushNotification({ userId, title, body, url, collapseId? })` — when set, payload gets `collapse_id` and `web_push_topic` = collapseId.

- [ ] Tests: `notificationUrl("CHAT")` → `/dashboard/chats`; metadata url wins; non-`/` metadata url ignored. `notify` with pref `introRequests:false` creates the row but no push; `pushOnly` creates no row; SYSTEM pushes even with all prefs false; db failure → resolves.
- [ ] Run `npx vitest run src/__tests__/notify.test.ts src/__tests__/notification-links.test.ts` → FAIL, implement, → PASS.
- [ ] Read route: single-id PATCH uses `updateMany({ where: { id, userId } })`; 404 when count 0.
- [ ] Notifications page: replace local `NOTIFICATION_LINKS` with `notificationUrl(n.type, n.metadata)`; add `typeConfig` entries for INTRO_REQUEST (icon `Users`) and CHAT (icon `MessageCircle`); add the two preference toggles ("طلبات التعارف", "رسائل المحادثات").
- [ ] Commit `feat(notifications): central notify helper, links, preferences`.

### Task 3: Credits in per-request mode

**Files:** Modify `src/lib/credits.ts`, `src/lib/matching/auto-suggest.ts`, `src/app/api/admin/suggestions/generate/route.ts`, `src/app/api/payments/webhook/route.ts`, `src/components/shared/dashboard-sidebar.tsx` (label "الرصيد"). Create `scripts/new-cycle-migrate.mjs`. Test: extend `src/__tests__/matching/auto-suggest.test.ts`.

**Interfaces — Produces:** `FREE_MATCH_CREDITS = 2` (unchanged), `NEW_CYCLE_FREE_CREDITS = 3`, `getRegistrationCredits(): Promise<number>` (3 when switch on, else 2; used by `src/app/api/auth/register/route.ts`); `WEEKLY_FREE_SUGGESTIONS = 3`; `notifyCreditsExhausted(userId)` wording "انتهى رصيدك" / "استخدمت كل رصيدك. اشحن رصيدك لإرسال طلبات تعارف أو محادثة جديدة." (via `notify`, PAYMENT).

- [ ] Tests (auto-suggest, `getCycleFlags` mocked to `{introRequests:true}`): user with 0 credits still gets suggestions; `reserveCredits` never called; with 2 suggestions created in the last 7 days only 1 is created; `notifyCreditsExhausted` not called. Flags off → existing tests unchanged and passing.
- [ ] Implement: in per-request mode skip the credit check/reserve/refund/exhausted calls and use `take = WEEKLY_FREE_SUGGESTIONS - countCreatedLast7Days` (`db.suggestion.count({ where: { recipientId, createdAt: { gte } } })`). Same rule in admin generate.
- [ ] Webhook: inside `checkout.session.completed`, `updateMany({ where: { id: paymentId, status: { not: "COMPLETED" } } })`; if count 0, break without adding credits. Message "تمت إضافة X رصيد إلى حسابك."
- [ ] Migration script (Node ESM, loads `.env` like `prisma/seed.mjs`, `PrismaPg`): exits if `SystemSetting` `migration_new_cycle_v1` exists; for USER role users with `matchCredits < 3` set to 3; create a SYSTEM notification for every USER: title "نظام رصيد جديد", body "أصبح الرصيد يُستخدم فقط عند إرسال طلب تعارف عائلي أو طلب محادثة، والاقتراحات أصبحت مجانية. أهديناك رصيداً ليصبح ٣ على الأقل.", metadata `{url:"/dashboard/payments"}`; writes the setting; prints counts. Supports `--dry-run`.
- [ ] Run `npx vitest run` → all PASS. Run `node scripts/new-cycle-migrate.mjs --dry-run` locally → prints counts, writes nothing.
- [ ] Commit `feat(credits): per-request credits mode and migration script`.

### Task 4: (folded into 5) — intentionally none.

### Task 5: Intro request rules

**Files:** Create `src/lib/intro/errors.ts`, `src/lib/intro/requests.ts`. Test `src/__tests__/intro/requests.test.ts`.

**Interfaces — Produces:**
- `class IntroError extends Error { code: string; status: number }` with codes `NOT_FOUND`(404) `DISABLED`(404) `BLOCKED`(403) `NO_CREDITS`(402) `DUPLICATE`(409) `NOT_ALLOWED`(409) `GUARDIAN_REQUIRED`(412) `CONSENT_REQUIRED`(412) `EXPIRED`(410).
- `type IntroState = { flags: {introRequests:boolean; chat:boolean}; credits: number; family: { status: "none"|"pending_sent"|"pending_received"|"accepted"|"legacy_admin"; requestId?: string; expiresAt?: string; contacts?: { name: string; relationship: string; phone: string } }; chat: { status: "none"|"pending_sent"|"pending_received"|"open"|"ended"|"expired"|"disabled"; requestId?: string; conversationId?: string; expiresAt?: string }; myGuardian: { exists: boolean; consented: boolean } }`
- `getMatchIntroState(matchId: string, userId: string): Promise<IntroState>` — expires stale PENDING requests first (`expiresAt < now` → EXPIRED); `legacy_admin` when match has a VisitRequest in FAMILIES_CONTACTED or SCHEDULED; `contacts` only when a FAMILY request is ACCEPTED and the partner's `shareConsentAt` is set.
- `sendIntroRequest(args: { matchId: string; senderId: string; type: "FAMILY"|"CHAT" }): Promise<{ requestId: string; creditsLeft: number }>` — order: flags (DISABLED) → match party (NOT_FOUND) → block either way (BLOCKED) → state rules (DUPLICATE when a PENDING one exists / NOT_ALLOWED: same type DECLINED before on this match, family accepted, legacy_admin, chat when a conversation exists; chat flag off → DISABLED) → FAMILY needs sender ParentInfo (GUARDIAN_REQUIRED) with consent (CONSENT_REQUIRED) → charge: free when `type==="FAMILY"`, the match has a Conversation and no earlier FAMILY request on this match, else `reserveCredits(senderId,1)` (NO_CREDITS) → create with `expiresAt = now + 7d` → `notify` receiver (INTRO_REQUEST, title "طلب تعارف عائلي جديد" / "طلب محادثة جديد", url `/dashboard/matches?match=<matchId>`) → if credits now 0, `notifyCreditsExhausted`.
- `respondToIntroRequest(args: { requestId: string; userId: string; accept: boolean; consent?: boolean }): Promise<{ status: "ACCEPTED"|"DECLINED"; conversationId?: string }>` — must be receiver (NOT_FOUND), PENDING (NOT_ALLOWED), not expired (EXPIRED, marks EXPIRED). Accept FAMILY: receiver needs ParentInfo (GUARDIAN_REQUIRED); if `consent` true set `shareConsentAt = now`; else require it (CONSENT_REQUIRED); legacy VisitRequest with status REQUESTED → CANCELLED, `adminNotes: "Closed: families connected via family introduction"`. Accept CHAT: create Conversation `expiresAt = now + 14d`. Notify sender (accepted: "تم قبول طلبك" with url chat or matches; declined: "لم يتم قبول الطلب حالياً"). No refund.
- `setGuardianConsent(userId: string): Promise<void>` — GUARDIAN_REQUIRED when no ParentInfo.

- [ ] Write tests (mocked `db`, `notify`, `credits`, `settings`): not a party → NOT_FOUND; flags off → DISABLED; blocked → BLOCKED; `reserveCredits` false → NO_CREDITS and no create; second send while pending → DUPLICATE and `reserveCredits` not called; FAMILY without consent → CONSENT_REQUIRED; FAMILY after chat conversation → no `reserveCredits`; accept CHAT creates conversation with 14-day expiry; accept FAMILY cancels REQUESTED legacy visit; decline → no refund call; expired pending → EXPIRED; state `legacy_admin` for SCHEDULED visit while chat stays `none`.
- [ ] Run `npx vitest run src/__tests__/intro` → FAIL; implement; → PASS.
- [ ] Commit `feat(intro): request rules with credits, consent and expiry`.

### Task 6: Intro APIs + match creation in new mode

**Files:** Create `src/app/api/matches/[id]/intro/route.ts` (GET state, POST `{type}`), `src/app/api/intro-requests/[id]/respond/route.ts` (POST `{accept:boolean, consent?:boolean}`), `src/app/api/profile/guardian-consent/route.ts` (POST), `src/app/api/me/counts/route.ts` (GET `{flags, pendingIntros, unreadChats}`), `src/lib/intro/http.ts` (`introErrorResponse(e: unknown): NextResponse`). Modify `src/app/api/suggestions/[id]/like/route.ts`, `src/app/api/interests/[id]/accept/route.ts`, `src/app/api/suggestions/[id]/reject/route.ts`, `src/app/api/profile/parent-info/route.ts` (accept `shareConsent?: boolean`).

- [ ] Routes validate bodies with zod (`zod/v4`), use `requireUser`, map `IntroError` → `{error, code}` with its status, other errors → 500 "حدث خطأ في الخادم".
- [ ] Like/accept routes: when `intro_requests_enabled` is on, skip `visitRequest.create`, and change the MATCH notification body to "يمكنك الآن إرسال طلب تعارف عائلي أو طلب محادثة." (use `notifyMany`, url `/dashboard/matches?match=<id>`). Like/reject: 404 unless `recipientId === me` and status PENDING.
- [ ] `unreadChats` = messages with `readAt null`, `senderId != me`, in my ACTIVE/EXPIRED conversations; `pendingIntros` = PENDING not expired where receiver = me.
- [ ] Manual check with curl against dev server (signed-in cookie from browser) → GET state returns JSON shape `IntroState`.
- [ ] Commit `feat(intro): API routes and new-mode match creation`.

### Task 7: Intro UI

**Files:** Create `src/components/intro/match-intro-panel.tsx`, `src/components/intro/intro-confirm-dialog.tsx`, `src/components/intro/guardian-contact-card.tsx`, `src/components/intro/guardian-consent-card.tsx`. Modify `src/app/(ar)/dashboard/matches/page.tsx` (render `<MatchIntroPanel matchId partnerName />` under the visit explanation; support `?match=` scroll + ring highlight), `src/app/(ar)/dashboard/page.tsx` (render `<GuardianConsentCard />` when guardian exists without consent and switch is on), `src/contexts/dashboard-context.tsx` (add `counts` from `/api/me/counts`, polled with unread), `src/components/shared/dashboard-sidebar.tsx` (badge `pendingIntros` on التوافقات; المحادثات link with `unreadChats` badge only when `flags.chat`), `src/app/(ar)/dashboard/profile/setup/page.tsx` and `profile/edit/page.tsx` step 5 (consent checkbox, copy: "أوافق على مشاركة اسم ورقم وليّ الأمر مع عائلة الطرف الآخر فقط بعد قبول طلب التعارف العائلي").

- [ ] Panel renders nothing when `flags.introRequests` is false. Layout: title "خطوات التعارف", two option tiles (family: `Users` icon, "طلب تعارف عائلي", "نشارك بيانات وليّ الأمر بين العائلتين"; chat: `MessageCircle`, "طلب محادثة قبل الزيارة", "محادثة نصية داخل نصيبك لمدة ١٤ يوماً"), each with a status chip (amber pending, emerald accepted, muted declined/expired) and one action button. Received pending → "قبول" / "ليس الآن" buttons. Accepted family → `GuardianContactCard` (name, relationship, phone with `tel:` and `https://wa.me/<digits>` links). Open chat → "فتح المحادثة" link.
- [ ] Send flow: `IntroConfirmDialog` shows cost line "سيتم خصم رصيد واحد (رصيدك الحالي: N). لا يُسترجع الرصيد في حال عدم القبول." (or "مجاني لأنكما في محادثة" for family-after-chat), plus the consent checkbox when `myGuardian.consented` is false, plus a link to profile step 5 when no guardian. 402 → toast with "اشحن رصيدك" action to `/dashboard/payments`.
- [ ] Toasts via `sonner`; buttons show a spinner and are guarded against double submit.
- [ ] Verify in browser (seeded pair هديل/يزن, switches on): send family request as one, accept as the other with consent, both see guardian card; credits drop by 1 for sender only.
- [ ] Commit `feat(intro): match intro panel, dialogs and consent UI`.

### Task 8: Chat filter

**Files:** Create `src/lib/chat/filter.ts`. Test `src/__tests__/chat/filter.test.ts`.

**Interfaces — Produces:** `checkMessage(body: string): { ok: true; text: string } | { ok: false; reason: "EMPTY"|"TOO_LONG"|"CONTACT"|"LINK"|"OFFENSIVE"; message: string }` — trims; normalizes Arabic-Indic (٠-٩) and Persian (۰-۹) digits; CONTACT when ≥7 digits remain after removing spaces, dashes, dots and parentheses within any run, or Arabic number words for 7+ consecutive digits, or `@handle`, or keywords (`whatsapp|واتس|instagram|انستا|snap|سناب|telegram|تلغرام|تيليجرام|facebook|فيسبوك|tiktok|تيك توك`) ; LINK for `http`, `www.`, `wa.me`, `t.me`, domains like `\w+\.(com|net|org|me|jo|io)`; OFFENSIVE from a short list in the same file. Messages (Arabic): CONTACT/LINK → "لا يمكن مشاركة أرقام الهواتف أو الروابط أو حسابات التواصل. مشاركة التواصل تتم عبر التعارف العائلي."; OFFENSIVE → "الرجاء الالتزام بأسلوب محترم."; TOO_LONG → "الرسالة طويلة جداً (الحد ١٠٠٠ حرف).".

- [ ] Tests: "0791234567", "07 9123 4567", "٠٧٩١٢٣٤٥٦٧", "+962-79-123-4567", "صفر سبعة تسعة واحد اثنين ثلاثة اربعة", "wa.me/96279", "my insta @yazan_99", "www.site.com", "زورني على instagram" → blocked; "عمري 29 وأسكن في عمّان منذ 2015" and "عندي 3 إخوة" → ok; 1001 chars → TOO_LONG; "   " → EMPTY.
- [ ] Run → FAIL; implement; → PASS. Commit `feat(chat): message filter`.

### Task 9: Chat service + Ably

**Files:** Create `src/lib/ably.ts`, `src/lib/chat/service.ts`. Test `src/__tests__/chat/service.test.ts`. `pnpm add ably`.

**Interfaces — Produces:**
- `ably.ts`: `isAblyConfigured(): boolean`; `publishChatEvent(conversationId: string, name: "message"|"read"|"status", data: unknown): Promise<void>` (no-op without key, never throws); `createChatTokenRequest(userId: string, conversationIds: string[]): Promise<unknown>` — capability `{ "chat:<id>": ["subscribe"] }` per id, `clientId = userId`, ttl 1h.
- `type ChatSummary = { id; matchId; partner: { id; firstName; isVerified }; status: "ACTIVE"|"ENDED"|"EXPIRED"; expiresAt: string; canExtend: boolean; lastMessage: { body; createdAt; mine } | null; unread: number }`
- `type ChatMessage = { id; body; createdAt: string; mine: boolean; readAt: string | null }`
- `listConversations(userId): Promise<ChatSummary[]>`; `getConversation(id, userId, opts?: { before?: string; limit?: number }): Promise<{ conversation: ChatSummary; messages: ChatMessage[]; hasMore: boolean }>` (limit default 30, oldest-first in response); `sendMessage({ conversationId, senderId, body }): Promise<ChatMessage>`; `markRead(conversationId, userId): Promise<number>`; `extendConversation(id, userId): Promise<ChatSummary>`; `endConversation({ conversationId, userId, report?: { reason: ReportReason; details?: string } }): Promise<void>`.
- Errors: reuse `IntroError` (NOT_FOUND, DISABLED, NOT_ALLOWED, EXPIRED, BLOCKED) plus `RATE_LIMITED`(429) and `FILTERED`(422, message from `checkMessage`).
- Lazy rules on every read: ACTIVE with `expiresAt < now` → EXPIRED (+ `publishChatEvent status`); ACTIVE with < 2 days left and `expiryWarnedAt` null → set it and `notifyMany` both (CHAT, "تنتهي المحادثة قريباً", "بقي يومان على انتهاء المحادثة. يمكنكما التمديد مرة واحدة أو الانتقال لتعارف عائلي.").
- `sendMessage`: `chat` flag on (else DISABLED — reads still work), party, ACTIVE, not blocked, `rateLimit("chat-day:"+senderId,{maxAttempts:50,windowMs:86400000})` and `rateLimit("chat-sec:"+senderId,{maxAttempts:1,windowMs:1000})`, `checkMessage`, create, `publishChatEvent(id,"message",{id,senderId,body,createdAt})`, push to partner via `notify({pushOnly:true, type:"CHAT", collapseId:"chat-"+id, url:"/dashboard/chats/"+id, title: senderFirstName, body: first 80 chars})` unless pushed in the last 3 minutes (module-level `Map<string, number>` keyed `id:recipient`).
- `endConversation`: ENDED + `endedById/At`; with `report` also `db.report.create` and `db.block.create` (skip if exists); notify partner (CHAT, "انتهت المحادثة", "أنهى الطرف الآخر المحادثة.").
- `extendConversation`: only ACTIVE, `extended=false`, ≤3 days left → `expiresAt += 7d`, `extended = true`, clears `expiryWarnedAt`.

- [ ] Tests (mock db, ably, notify, rate-limit, settings): non-party → NOT_FOUND; expired conversation send → EXPIRED and status updated; filtered body → FILTERED and nothing saved; rate limited → RATE_LIMITED; successful send publishes once and pushes once, a second send within 3 minutes pushes zero more times; chat flag off → send DISABLED but `getConversation` works; extend with 10 days left → NOT_ALLOWED; extend twice → NOT_ALLOWED; end with report creates report + block.
- [ ] Run → FAIL; implement; → PASS. Commit `feat(chat): conversation service and Ably publishing`.

### Task 10: Chat APIs

**Files:** Create `src/app/api/chats/route.ts` (GET list), `src/app/api/chats/[id]/route.ts` (GET `?before=`), `src/app/api/chats/[id]/messages/route.ts` (POST `{body}`), `src/app/api/chats/[id]/read/route.ts` (POST), `src/app/api/chats/[id]/extend/route.ts` (POST), `src/app/api/chats/[id]/end/route.ts` (POST `{report?:{reason, details?}}`), `src/app/api/chats/ably-token/route.ts` (GET → token request JSON for the user's ACTIVE/EXPIRED conversations; 404 when Ably not configured).

- [ ] Same `requireUser` + zod + `introErrorResponse` pattern; `read` also publishes a `read` event.
- [ ] Manual curl check: POST a message with "0791234567" → 422 with the filter message.
- [ ] Commit `feat(chat): API routes`.

### Task 11: Chat UI

**Files:** Create `src/components/chat/use-chat-channel.ts` (hook: subscribes via `ably` Realtime with `authUrl: "/api/chats/ably-token"`, falls back to polling `GET /api/chats/[id]?after` every 4s when token route returns 404 or connection fails; exposes `onMessage`, `onRead`, `onStatus`), `src/components/chat/chat-list.tsx`, `src/components/chat/chat-room.tsx`, `src/components/chat/message-bubble.tsx`, `src/components/chat/chat-composer.tsx`, `src/components/chat/starter-questions.tsx`. Create pages `src/app/(ar)/dashboard/chats/page.tsx`, `src/app/(ar)/dashboard/chats/[id]/page.tsx`. Add `@keyframes bubbleIn` to `src/app/globals.css`.

- [ ] List: card per chat with avatar initial, name + `VerifiedBadge`, last message preview, relative time, unread pill, status chip (متبقي N أيام / منتهية / مغلقة). Empty state: "لا توجد محادثات بعد" + link to matches.
- [ ] Room (matches the approved mockup): header (back, avatar, name, badge, menu: تمديد / إنهاء المحادثة / إبلاغ), info strip (days left), day separators ("اليوم"، "أمس"، date), bubbles (mine = `bg-primary text-primary-foreground` on the start side, theirs = `bg-muted`), ✓/✓✓ read state, `bubbleIn` animation, auto-scroll unless reading history, "تحميل رسائل أقدم" button, card "جاهزون لخطوة العائلة؟" with "ننتقل لتعارف عائلي" (opens `IntroConfirmDialog` for FAMILY, free), composer (textarea auto-grow, Enter sends, Shift+Enter newline, counter after 800 chars, inline Arabic error from 422/429), starter questions on an empty chat, read-only banner when ENDED/EXPIRED. Optimistic send with "جارٍ الإرسال" state and retry on failure. Mobile: full height, composer sticks above keyboard (`100dvh`).
- [ ] Mark read on open and on each incoming message while visible; dispatch `naseeb:notifications-read` so badges refresh.
- [ ] Verify in browser with two sessions (normal + private window) using seeded users: messages appear without reload (polling locally), filter error shows, ending the chat makes the other side read-only.
- [ ] Commit `feat(chat): chat list and room UI`.

### Task 12: Admin

**Files:** Create `src/app/api/admin/settings/new-cycle/route.ts` (GET/PATCH `{introRequests?: boolean, chat?: boolean}` via `setSetting`), `src/app/api/admin/introductions/route.ts` (GET `?page&type&status` → `{stats:{pending, accepted, declined, expired, activeChats}, requests:[{id,type,status,createdAt,respondedAt,sender:{id,firstName,lastName},receiver:{...}}], page,totalPages,total}`), `src/app/(en)/admin/introductions/page.tsx`. Modify `src/app/(en)/admin/settings/page.tsx` (new "New user cycle" card first), `src/components/shared/admin-sidebar.tsx` (add "Introductions" after "Visit Requests").

- [ ] Settings card: two `Switch` rows — "Family and chat requests" ("Users send requests from their matches. Suggestions become free; each request costs 1 credit.") and "In-app chat" ("Matched users who accept a chat request can message each other for 14 days.") — chat switch disabled with hint "Turn on requests first" while requests are off. Turning requests off shows a confirm: "Users won't be able to send new requests. Existing chats stay readable."
- [ ] Introductions page: 5 stat tiles, filters (type, status), table (Sender → Receiver links to `/admin/users/[id]`, type badge, status badge, sent, answered), pagination. Note under the title: "Message content is private and isn't shown here."
- [ ] Commit `feat(admin): new cycle switches and introductions overview`.

### Task 13: Docs + verification

**Files:** Modify `CLAUDE.md` (domain rules, credits, new switches, chat, notify helper), `.env.example` (`ABLY_API_KEY=""`).

- [ ] Run `npx vitest run` → all PASS; `./node_modules/.bin/tsc --noEmit` → exit 0; `npx pnpm@10.24.0 lint` → no new errors in touched files.
- [ ] Full browser run-through locally with both switches on, then both off (site behaves as before: no panel, no chat link, suggestions use credits).
- [ ] Commit `docs: new cycle rules and setup`.
