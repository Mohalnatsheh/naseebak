# API contracts the app relies on

Read from the route files under `../src/app/api/**/route.ts` and checked against the local backend (port 3020) on
2026-10-29. Errors everywhere: `{ error: string, code?: string }` (+ extra fields such as `retryAfterMinutes`,
`fields`). The app maps them in `lib/core/network/api_exception.dart`.

## Public

`GET /api/countries` → `{ defaultCountry, countries: Country[] }`
`Country = { code, name:{ar,en}, inName, flag:{emoji,id}, dialCode, phone:{placeholder,example,nationalPattern},
currency:{code,symbol}, locales, defaultLocale, direction, timeZone, dateLocale, isDefault, active, registrationOpen,
purchasesEnabled, features:{polls}, words:{phone,tribe,nationalityMale,nationalityFemale} }`
(`features.chat` was removed on 2026-10-29; chat availability comes from `/api/me/counts` → `flags.chat`.)

`GET /api/countries/{code}` → `{ country: Country & { content, support:{email,phone,whatsapp}, links:{home,terms,privacy,refundPolicy,faq,contact,register}, lists:{ cities: string[], areas: Record<city, string[]>, nationalities:{ male: string[], female: string[] } } } }`
(`lists` feeds the setup wizard's city chips and nationality menu; the app keeps no copy of these lists.)

## Auth

- `POST /api/auth/send-otp` `{ phone, context:"login"|"register", country }` → `{ message, userExists? }` (login only)
- `POST /api/auth/verify-otp` `{ phone, code }` → `{ verified:true }`
- `POST /api/auth/register` `{ firstName, lastName, phone, gender, otp, termsAccepted:true, country }` → 201 `{ message, user }`; 409 `PHONE_EXISTS`
- `POST /api/mobile/auth/token` `{ phone, code, device? }` → 201 `{ token, expiresAt, user: Me }`; 401 `INVALID_CODE`; 429 `RATE_LIMITED`
- `GET /api/mobile/me` → `{ user: Me }`, `Me = { id, firstName, lastName, gender, phone("962…"), country: Country, credits, status, deactivated, profile:{exists,complete}, createdAt }`
- `POST /api/mobile/auth/logout` → `{ ok:true }`
- 403 `{ code:"DEACTIVATED" }` from `requireUser()` for paused accounts; `POST /api/profile/reactivate` → `{ message, reactivated }`

## Counts

`GET /api/me/counts` → `{ flags:{introRequests,chat,mutualSuggestions,creditOnInterest}, pendingIntros,
pendingIntroMatchId, unreadChats, hasChats, guardian:{exists,consented}|null, actionableMatches, credits?, newSuggestions?, likedYou? }`
(with `introRequests` off the server returns zeros and `guardian:null`).

## Suggestions

- `GET /api/suggestions` (page 1 tops up) → `{ mutualView, credits, emptyReason:"weekly_cap"|"no_candidates"|"pending"|null, nextSuggestionsAt, suggestions[], page, totalPages, total }`
- `GET /api/suggestions/feed?tab=new|interested|waiting&page=` → `{ items: FeedItem[], page, totalPages, total }`
  `FeedItem = { kind:"mutual"|"legacy_suggestion"|"legacy_interest"|"legacy_sent", id, compatibilityScore, reason, createdAt, expiresAt?, candidate: Person, likedYou?, declined? }`
  `Person = { id, firstName, isVerified, age, city, area, nationality, education, fieldOfStudy, job, incomeRange, height, weight, skinColor, maritalStatus, childrenCount, religiosity, smokingStatus, aboutMe, hobbies, interests, lifestyle, beard, hijab, tribe, familyOriginArea, numberOfSiblings, housingType, cookingAbility, drivingLicense, willingToRelocate, familyValues }` — never photos.
- Answers by kind:
  - `mutual`: `POST /api/suggestions/{id}/decide` `{ interested, introPreference?:"CHAT"|"FAMILY", guardianConsent? }` → `{ match, matchId?, creditsLeft? }`; errors `NO_CREDITS`(402) `GUARDIAN_REQUIRED`/`CONSENT_REQUIRED`(412) `PREFERENCE_REQUIRED`(400) `NOT_FOUND`(404)
  - `legacy_suggestion`: `POST /api/suggestions/{id}/like` → `{ message, match }`, `POST /api/suggestions/{id}/reject` → `{ message }`
  - `legacy_interest` (id = Like id): `POST /api/interests/{id}/accept` → `{ message, match:true }`, `POST /api/interests/{id}/reject`
  - `legacy_sent`: read only

## Matches

- `GET /api/matches?page=&focus=<matchId>` → `{ matches: Match[], page, totalPages, total }`
  `Match = { id, closed:"blocked"|"inactive"|"finished"|"ended"|"engaged"|null, blockId, photosRevealed, revealed, createdAt, visitRequestId, visitStatus, scheduledDate, compatibilityScore, partner: Person }` (no single-match endpoint: the app uses `?focus=`)
- `GET /api/matches/{id}/intro` → `IntroState = { flags, outcome?, closed, credits, family:{status,requestId?,expiresAt?,declinedByMe?,free?,openUntil?,contacts?:{name,relationship,phone}}, chat:{status,requestId?,expiresAt?,declinedByMe?,conversationId?,paused?}, followUp:{mine,partner,ask}, myGuardian:{exists,consented,sharedForMatch,askShare} }`
- `POST /api/matches/{id}/intro` `{ type:"FAMILY"|"CHAT", consent?:true }`
- `POST /api/intro-requests/{id}/respond` `{ accept, consent? }`, `POST /api/intro-requests/{id}/cancel`
- `POST /api/matches/{id}/guardian-share` `{ consent:true }` → IntroState
- `POST /api/matches/{id}/outcome` `{ outcome:"CONTINUING"|"NOT_A_MATCH"|"ENGAGED" }` → IntroState
- `GET /api/matches/{id}/photos` → `{ photos:[{ id, url, … }] }` (403 when locked)
- `POST /api/blocks` `{ blockedId }`, `GET /api/blocks` → `{ blocks:[{ id, blocked:{id,firstName}, … }] }`, `DELETE /api/blocks/{id}`
- `POST /api/reports` `{ reportedId, reason:"FAKE_PROFILE"|"INAPPROPRIATE_CONTENT"|"HARASSMENT"|"SPAM"|"OTHER", details? }`

## Chats

- `GET /api/chats` → `{ conversations: ChatSummary[] }`
  `ChatSummary = { id, matchId, partner:{id,firstName,isVerified}, status:"ACTIVE"|"ENDED"|"EXPIRED", expiresAt, canExtend, endedByMe, blocked, matchHidden, lastMessage:{body,createdAt,mine}|null, unread }`
- `GET /api/chats/{id}?before=<iso>|after=<iso>` → `{ conversation: ChatSummary, messages: ChatMessage[], hasMore, chatEnabled }` (30 per page, oldest first; `after` returns up to 100 newer — used for 4 s polling)
  `ChatMessage = { id, body, createdAt, mine, readAt }`
- `POST /api/chats/{id}/messages` `{ body (≤2000), clientNonce? }` → `{ message: ChatMessage }`; 422 `FILTERED` (numbers/links), 429 `RATE_LIMITED`, 410 `EXPIRED`, 409 `NOT_ALLOWED`
- `POST /api/chats/{id}/read` `{ upTo? }` → `{ marked }`
- `POST /api/chats/{id}/end` `{ report?:{ reason, details? } }`, `POST /api/chats/{id}/extend` → `{ conversation }`

## Notifications

- `GET /api/notifications?page=` → `{ notifications:[{ id, type, title, body, isRead, metadata:{url?}|null, createdAt }], unreadCount, page, totalPages, total }`
- `GET /api/notifications/unread-count` → `{ count }`
- `PATCH /api/notifications/{id}/read`, `PUT /api/notifications/read-all`
- `GET /api/notifications/preferences` → `{ preferences:{ suggestions, interests, matches, visitUpdates, payments, identity, support, introRequests, chatMessages, … } }`; `PATCH` with any subset of those booleans

## Polls

- `GET /api/polls/current` → `{ poll: PublicPoll|null, member? }`
  `PublicPoll = { id, slug, question, options:[{id,label}], note, status, endsAt, myVote, rewardCredits, offerCredits, results:{ total, percents:{[optionId]:int}, split }|null, votesNeeded }`
- `POST /api/polls/vote` `{ pollId, optionId, source:"dashboard" }` → `{ poll: PublicPoll, created }`

## Payments

- `GET /api/payments/plans` → `{ country, purchasesEnabled, packages:[{ id, name, credits, price, currency, currencySymbol, chargeUsd?, chargeLabel, popular?, wasPrice? }] }`
- `POST /api/payments/checkout` `{ packageId, mode:"hosted" }` → `{ checkoutUrl, paymentId }` or (local mock) `{ mock:true, paymentId }`; 403 `PURCHASES_DISABLED`, 400 `INVALID_PACKAGE`, 502
- `GET /api/payments/{id}/status` → `{ payment:{ id, status, packageId, amount, currency, createdAt }, credits }`
- `POST /api/dev/mock-checkout/{id}` `{ outcome:"paid"|"cancelled" }` → `{ result }` (local only)
- `GET /api/payments/history?page=` → `{ payments: PaymentRow[], matchCredits, page, totalPages, total }` (raw Prisma rows: `id, planName, amount (decimal string), currency, status, description, createdAt, …`)

## Profile

- `GET /api/profile` → `{ user:{ id, firstName, lastName, email, phone, gender, country, status, isVerified, isDeactivated, matchCredits, createdAt, profile|null, personalityResult, parentInfo:{id,parentName,relationship,address,shareConsentAt}|null, identityDoc, photos, _count }, completeness:{ total, sections, level, tips } }`
- `PUT /api/profile` — required: `dateOfBirth (YYYY-MM-DD, 18–80), city, nationality, education (ثانوية عامة|دبلوم|بكالوريوس|ماجستير|دكتوراه), maritalStatus (أعزب/عزباء|مطلق/مطلقة|أرمل/أرملة), religiosity (ملتزم جداً|ملتزم|متوسط|غير ملتزم), prefAgeMin, prefAgeMax` (+ `childrenCount`); everything else optional. With intro requests **off**, an incomplete profile needs the guardian saved first (400 `GUARDIAN_REQUIRED`). Once complete, changing a stored value → 409 `PROFILE_EDIT_NEEDS_REVIEW` (filling an empty field is allowed).
- `POST /api/profile/update-request` `{ changes:{…}, message? }` — reviewed by the team (partner preferences apply at once)
- `GET/PUT /api/profile/parent-info` `{ parentName (Arabic), parentPhone (country mobile), relationship:"father"|"mother"|"brother"|"guardian", address, notes?, shareConsent?:true|false }`
- `POST /api/profile/deactivate` `{ action:"pause"|"resume" }`, `POST /api/profile/delete` (30-day grace)
