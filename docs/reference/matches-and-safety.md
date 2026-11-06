# Matches and safety

Introductions, chat, blocks, reports, leaving.

> Reference detail moved out of `CLAUDE.md` on 2026-11-06. If this file and `CLAUDE.md` differ, `CLAUDE.md` wins.

## After a match

Spec: `docs/superpowers/specs/2026-10-16-new-cycle-design.md`. After a mutual match (`createMutualMatch` in `src/lib/intro/match.ts` — no admin `VisitRequest` in new mode) the match card shows `MatchIntroPanel` with two requests (rules in `src/lib/intro/requests.ts`, errors as `IntroError` codes):

- **FAMILY** → accepted: both see the other's guardian contact (`GuardianContactCard`). Legacy visits in FAMILIES_CONTACTED/SCHEDULED/COMPLETED hide this option; a REQUESTED legacy visit is closed when a family intro is accepted
- **CHAT** → accepted: `Conversation` for 14 days (+7 once in the last 3 days). Free chat→family move once. Day 7: one "ready for a family introduction?" push to both (`Conversation.familyNudgeAt`); at expiry: one "move to family? it's free until <date>" push (chat expiry + `CHAT_STALE_DAYS`, `familyMoveOpenUntil()` in `matches/state.ts`, same rule as `family.openUntil`) and a button in the read-only chat footer — both only while the family path is open (no pending/accepted family request, chat not ended by a user)
- Requests expire after 7 days (lazily, and the daily scheduler notifies the sender); a declined request is final for that type on that match
- Chat: `src/lib/chat/service.ts` + `src/lib/chat/filter.ts` (blocks phones incl.
  - Arabic digits/words, links, handles, social keywords; also a number hidden among words — 6+ spelled digits or 9+ digits in total anywhere in one message, years 1950–2039 and round amounts ending in 00 not counted — and look-alike letters inside a number (O→0, I/l/i→1, other letters between digits dropped); runs before the rate limit: 5 per 5s, no daily cap).
  - Real time via Ably (`src/lib/ably.ts`, env `ABLY_API_KEY`): only the server publishes to `chat:<id>`; browsers get subscribe-only tokens from `/api/chats/ably-token`.
  - Without the key the page polls every 4s.
  - Admins can read full chat history at `/admin/chats/[id]` (`GET /api/admin/chats/[id]/messages`; every view logged as `[admin-chat-view]`); the privacy policy and terms say the team may review chats for safety and moderation
- On phones the chat room is full screen (`max-md:fixed`, sized to `visualViewport` so the keyboard never covers the box) and the dashboard bottom bar is hidden there
- Expiry + "2 days left" warning run lazily (counts poll `/api/me/counts`, chat reads) and again in the daily scheduler (below)
- Admin: Settings → "New user cycle" switches; `/admin/introductions` overview

## Account and match safety

- **Deactivation / deletion grace:** deactivated users (incl. the 30-day deletion grace) can still sign in; the dashboard layout shows only `/dashboard/reactivate` (`DeactivatedGate`), and `requireUser()` rejects them with 403 `DEACTIVATED` unless a route opts in with `{ allowDeactivated: true }` (`/api/profile/reactivate`, `/delete`, `/deactivate`).
  - `POST /api/profile/reactivate` clears the flag and cancels a pending deletion.
  - `POST /api/profile/deactivate` takes an explicit `{ action: "pause" | "resume" }` (never a toggle; no body = pause); resume also cancels a pending deletion, and `processAccountDeletions` re-checks each row (not cancelled, due, account still paused) right before deleting.
  - Suspended users stay blocked everywhere
- **Match states** (`src/lib/matches/state.ts`, `MatchClosure` = `blocked` | `inactive` | `finished` | `ended` (someone said «لم يحصل نصيب») | `engaged` (I said «تمت الخطبة»)); a chat that ran out more than `CHAT_STALE_DAYS` (14) ago with no family request counts as finished; a block hides the match from the blocked person (404s) and shows the blocker a closed card with unblock (photos 403, no guardian contact, pending requests CANCELLED, no refund); a deactivated/suspended partner is skipped in the feed, can't be matched, requested or messaged; a match with both paths used up (declined, or a user-ended chat) is "finished".
  - `/api/me/counts` → `actionableMatches` drives the next-step card
- A block ends the open chat for good (ENDED by the blocker, so unblocking never silently reopens it). The blocked person loses the match but keeps the chat **read-only** (`loadForUser(…, { readOnly: true })` for reading, marking read and reporting; sending/extending 404; no Ably token, no read receipts across a block; `ChatSummary.matchHidden` hides the match link) so a harasser who blocks first can't erase what was said or stop a report («إبلاغ» on an ended chat). Numbers sent in pieces are caught across the sender's consecutive number-only messages (`completesSplitNumber`, 10-minute window)
- A user-ended chat closes the family path on that match (expired / admin-ended chats keep the free move). Only an open chat (ACTIVE, not run out, no block either way) can be ended: «إنهاء المحادثة» is hidden otherwise and `endConversation` without a report refuses (NOT_ALLOWED); «إبلاغ» works on any chat and ends/notifies only an open one. Senders can cancel a PENDING request (`POST /api/intro-requests/[id]/cancel`, no refund; the receiver is told it was withdrawn). Match cards offer حظر / إبلاغ وحظر and «إنهاء التوافق» (= NOT_A_MATCH); blocked users list at `/dashboard/blocks`
- **Leaving:** pausing (`/api/profile/deactivate`), a deletion request and the final deletion call `closeActivityForLeaving()` (`src/lib/matches/leave.ts`): open chats end (with `endedByAdminId = "system:left"`, `CHAT_LEFT_MARKER`, not `endedById`, so they don't count as "ended by a user" and the free family move stays open), pending requests are cancelled, partners are told (on final deletion, every open match's partner). No "ends soon" push for a blocked/inactive chat and no extension with an inactive partner
- **Reports** go through `fileReport()` (`src/lib/reports.ts`) from both the match card (`POST /api/reports`, needs a prior suggestion or match: 403 otherwise; details ≤ 1000 chars; an optional `conversationId` is kept only if that chat is between the two) and the chat («إنهاء وإبلاغ»): a repeat report reopens the earlier one and appends the new account; every report emails the admins (`sendAdminAlert`) and recounts the auto-flag (3+ people, PENDING + REVIEWED).
  - **Paused for review:** when a member reaches 3 PENDING reports their open chats are paused (ENDED with `endedByAdminId = "system:report-review"`, `REPORT_PAUSE_MARKER`; both told) and intro requests / guardian sharing on their matches are refused (`assertMatchOpen` → `pausedForReview`), a new match opens no chat or family outcome (`applyIntroOutcome` → NONE, request buttons) and `sendMessage` refuses.
  - Admin review (`refreshReportFlag`) recounts the flag (an auto-flag is cleared when dismissals bring it under 3; a hand-set flag stays) and, once fewer than 3 are pending, resumes paused chats with the paused days added back to `expiresAt` — except a chat whose match closed meanwhile (block, «لم يحصل نصيب» / «تمت الخطبة», a side engaged elsewhere, a partner who left or was suspended): it ends for good (`PAUSED_MATCH_CLOSED_MARKER`).
  - Block, «لم يحصل نصيب», engagement (other matches) and leaving also end paused rows for good (`endPausedChats`) (`endPausedChat` = admin ends a paused chat for good).
  - Withdrawn guardian consent notifies partners on accepted family introductions
- **Account deletion keeps reports:** `processAccountDeletions` first runs `snapshotReportEvidence()` (both people's name/phone + the chat between them, latest 1000 messages, into `Report.evidence`), then deletes; `Report.reporterId`/`reportedId` are nullable with `onDelete: SetNull`. A failed snapshot skips that deletion until the next run. Admin → Reports shows a deleted side by its saved name/phone and the saved chat
- **Profile edits after setup:** `PUT /api/profile` and `PATCH /api/profile/draft` apply `reviewedChanges()` (`src/lib/profile-review.ts`) once `isComplete`: empty fields may be filled, identical values resent, but changing/clearing a stored value → 409 `PROFILE_EDIT_NEEDS_REVIEW` (use the edit page → review request). Legacy only: finishing the setup needs the guardian saved first (`PUT /api/profile` → 400 `GUARDIAN_REQUIRED`); the setup sends `dealbreakers` in the same save so the first suggestions respect them
- **Flagged users** (`isFlagged`: auto at 3+ PENDING/REVIEWED reports from different people, `flagReason` "Auto-flagged…", or set by an admin) get no new automatic/admin-generated suggestions and are not suggested; existing matches untouched (but chats/requests pause while 3+ reports are PENDING, above). Admin "Manage User" still shows them with a Flagged badge
- **Verified badge** is hidden everywhere user-facing when `intro_requests_enabled` is on

## Family introduction follow-up

- `src/lib/intro/followup.ts`, `POST /api/matches/[id]/outcome`.
- On the match card once both guardian contacts are out («كيف يسير التعارف العائلي؟»): ما زلنا نتعارف (CONTINUING) / تمت الخطبة (ENGAGED, confirm) / لم يحصل نصيب (NOT_A_MATCH, confirm).
- NOT_A_MATCH from either side closes the match for both (open chat ended, pending requests cancelled, partner told gently, photos locked 403) and resets the partner's ENGAGED on that match.
- ENGAGED is accepted only once the families were introduced (`familiesIntroduced`: accepted FAMILY intro with both guardian stamps on an `openedAt` match, or a legacy visit — the same condition as the question; else 409).
- ENGAGED closes all my PENDING shared suggestions, also ones I said «مهتم» to (EXPIRED, unanswered «مهتم» refunded), closes my other open matches (chats ended, requests cancelled, partners told) and pauses new suggestions (`isEngaged` / `NOT_ENGAGED` in auto-suggest), asks the partner to confirm; undo = CONTINUING (ended chats stay ended).
- The daily job asks 7 days after the family introduction (or a legacy visit in FAMILIES_CONTACTED/SCHEDULED/COMPLETED), then every 14 days while someone hasn't answered or is CONTINUING, at most 3 times, oldest first (`runFamilyFollowUps`); a mixed match's CHAT side is reminded once after 2 days to share (`remindGuardianShare`).
- Admin matches shows each side's outcome, follow-ups sent, automatic outcome rows and guardian sharing.
