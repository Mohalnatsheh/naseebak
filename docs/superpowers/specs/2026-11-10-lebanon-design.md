# Lebanon (LB) as a third country: design

Date: 2026-11-10. Branch `feature/lebanon` (worktree `../naseebak-lb`, from `origin/main` 6a2e74b).

## Intent

The owner: "start prepare content and country and all things for LB, use the same OTP provider as KSA", then
"add سني شيعي … make it in the preferences for LB", "go ahead with all".

Naseebak opens in Lebanon next to Jordan (root) and Saudi Arabia (`/sa`). Everything is prepared on production
**switched off**: Lebanon stays invisible (no `/lb` pages, no switcher entry, no sign-up, no sales) until the owner
turns it on in Admin → Countries. In Lebanon a family's first filter is the sect, so Lebanese members answer
«المذهب» and can ask for a sect in their partner (and mark it «شرط أساسي»).

## Goals

1. Country `LB` everywhere a country is chosen: facts, phone rules, cities and areas, currency, time zone, words,
   public pages under `/lb`, blog and polls per country, admin filters, payments, Pro, notices, test accounts.
2. Sign-in codes for Lebanese numbers go by **WhatsApp through VerifyWay**, exactly as Saudi codes do.
3. «المذهب» (sect) for Lebanese members: a profile question, a partner preference, a «شرط أساسي» key, shown on cards
   and in admin. Website now; app in version 1.2.0.
4. Lebanese public copy: landing hero, SEO title/description, FAQ, about, contact, terms, privacy, refund policy.
5. Purchases off until «Prices approved» is on for LB (draft prices in code), as Saudi Arabia was.

## Non-goals

- No change for Jordanian or Saudi members: no sect question, no new wording, same order and scores.
- No cross-country pairing (Lebanese meet Lebanese only, as today's rule).
- No SMS notices for Lebanon by default (VerifyWay sends sign-in codes only); push + bell as everywhere.
- No Lebanese pound (LBP) pricing.
- No new switch beyond the country's own `active` / `registrationOpen` / `purchasesEnabled` / `pricesApproved`, and `lb_relaxed_matching`.

## Anti-goals (a failure even if it works)

- Lebanon visible on production (a page, a link, the switcher, the sitemap, hreflang) before the owner turns it on.
- A Jordanian or Saudi member asked their sect, or scored on it.
- Any sect wording that ranks or judges a sect. Neutral labels only.
- Schema changes that are not purely additive.

## Decided

| Topic | Decision | Whose |
|---|---|---|
| Code, prefix | `LB`, `/lb`, hreflang `ar-LB`, flag 🇱🇧 (emoji) | builder's call (standard) |
| Phone | +961. Mobile national numbers `3XXXXXX` (7 digits, written locally `03 123 456`) and `70/71/76/78/79/81` + 6 digits (written without a 0: `71 123 456`) | builder's call (Lebanese numbering plan) |
| OTP | WhatsApp via VerifyWay when `VERIFYWAY_API_KEY` is set, same as SA | owner |
| Notice SMS | Provider DEFAULT for LB = NONE (no SMS notices) until the owner picks one in Admin → Countries | builder's call, owner to confirm |
| Currency | USD, shown and charged in USD («$»). Lebanon prices in dollars in practice | builder's call, owner to confirm |
| Credit packages | `lb_10` / `lb_25` / `lb_50` = 10 / 25 / 50 credits, **draft** $3 / $6 / $10, `PRICES_APPROVED.LB = false` | builder's call (draft only) |
| Pro | Plans per country in Admin → Countries as today (none set = no sale); USD, minimum $0.50 (Stripe) | existing design |
| Time zone, dates | `Asia/Beirut`, `ar-LB-u-nu-latn`, Levantine month names (same list as Jordan) | builder's call |
| Words | phone «هاتف», tribe field label «العائلة», area «المنطقة», kg «كغ», nationality «لبناني / لبنانية» | builder's call |
| Cities | The Lebanese qadas (districts) plus Beirut as «المدينة», a short list of towns/neighbourhoods each as «المنطقة» | builder's call |
| Income/expense ranges | In USD: income «أقل من 500 $», «500-1000 $», «1000-2000 $», «2000-4000 $», «أكثر من 4000 $»; expenses «أقل من 300 $», «300-700 $», «700-1500 $», «أكثر من 1500 $» | builder's call |
| Sect values | Stored `"سني"`, `"شيعي"`, `"أفضّل عدم الذكر"`; female labels «سنية» / «شيعية» / «أفضّل عدم الذكر». Adding a value later is additive | owner (2026-11-10: سني / شيعي, plus «أفضّل عدم الذكر») |
| «أفضّل عدم الذكر» | Lets anyone finish setup without stating a sect. Never shown on a card (as if empty), never offered as a partner preference, scores as unknown; fails a sect «شرط أساسي» like a missing value. Shown to admins as is | owner (option), builder (behaviour) |
| Sect scope | Asked and used **only for LB members** | owner |
| Sect as preference | `prefSect` (multi-select of سني / شيعي, like `prefReligiosity`), score weight 1.5, dealbreaker key `sect` «المذهب». A missing sect fails a sect dealbreaker (same rule as every key) | owner (preference), builder (weight) |
| Sect required? | Required in the website setup and app 1.2.0 setup for LB; the server never requires it (older apps) | builder's call |
| Sect edits after setup | Through the existing review queue like other profile fields; filling an empty value is direct | existing rule |
| Relaxed matching | New switch `lb_relaxed_matching` (Admin → Settings, off by default), same as `sa_relaxed_matching`: Lebanese members get suggestions with no score minimum (`minSuggestionScore` = 0 for LB), best score first; «شروط أساسية», same country and test-account separation still apply | owner (2026-11-10: "like KSA … ignore preferences to show all suggestions") |
| App | Version 1.2.0: «المذهب» in setup, edit, preferences, cards; WhatsApp wording from the server; +961 guardian phones. Lebanon opens only once 1.2.0 is live with the force update | owner ("ok go ahead with all") |

## How it fits the existing code (for the builder)

Fixed facts: `src/lib/countries/index.ts` (`COUNTRY_CODES`, `COUNTRIES`). Add `otpByWhatsapp: boolean` (SA, LB true)
and use it wherever code says `country === "SA"` to mean WhatsApp (`otpChannel`, `automatic.ts` channels, the
go-live checklist and warnings in `countries/settings.ts`, the code-screen wording). Replace every other
`sa ? X : Y` / `=== "SA" ? "SAR" : "JOD"` with a per-country lookup (`countryConfig(c).currency.code`, a
`Record<CountryCode, …>`), so Lebanon never silently gets Jordanian text or currency. `Record<CountryCode, …>` maps
make `tsc` list most places to fill.

Routing: `PREFIX`/`HREFLANG` in `src/lib/site-paths.ts`, `rewrites()` in `next.config.ts` (`/lb` and `/lb/<path>`
for each localized path), `src/proxy.ts` sets `x-site-country` from the segment (never `NextResponse.rewrite`).
Inactive countries already fall back (`getVisitorCountry`, `activeCountryCodes` in the layout and sitemap); the
proxy must also send `/lb/...` to the Jordanian page or 404 while LB is inactive — check what `/sa` does today
and match it.

Phone: `src/lib/phone.ts` (`PHONE_REGEX`, `phoneInputCountry` — its `length > 10` international test misses
`961` + 7 digits; `localPhone` must give `03…` for 3-numbers and `71…` with no extra 0), `phone-field.ts`,
validations (`contact.ts`, `form-checks.ts`). Unit tests for every accepted and refused format.

Content: `public-copy.ts`, `landing/content.ts`, `countries/content.ts` (SEO), `faq-data.ts`, about, contact,
terms, privacy, refund policy (each has JO and SA versions; add LB versions based on Jordan's text with Lebanese
references), register/login wording, polls/blog enums and admin selects (`validations/poll.ts`, `blog.ts`,
admin pages' unions), `poll-widget` share text, `guardian-contact-card`, `push-setup`, `country-flag`,
`final-cta` image, `(ar)/layout.tsx` `lang`. Legal pages for LB are a **draft for the owner's legal review**.

Money: `payments/packages.ts` (`lb()` helper, USD, `chargeCurrency: "usd"`, `chargeAmount = price*100`,
`CURRENCY_SYMBOL.USD = "$"`), `pro/plans.ts`, `pro/stripe-events.ts`, `payments/refund.ts` (`alertAbout` by
currency: USD → LB, but Jordanian payments store JOD so it stays unambiguous — verify), `validations/country-settings.ts`
(LB minimum 0.5), `admin/countries/[code]/route.ts`, `admin/revenue/route.ts`, the payments page note.

Sect (additive schema): `Profile.sect String?`, `Profile.prefSect String[] @default([])`. Through:
`profile-options.ts` (`OPTION_VALUES.sect`, labels), `validations/profile.ts`, `api/profile` (+ `draft`,
`update-request`, `dealbreakers`), `profile-completeness.ts` (LB only), `matching/score.ts` (preference detail +
`DEALBREAKER_KEYS` + `dealbreakerHolds`), `dealbreaker-summary.ts`, the feed/suggestions/matches/interests APIs
and card details, `admin/profile-changes.ts`, admin user and requests pages, `countries/settings.ts` options list
for `/api/countries/[code]`. The server drops `sect`/`prefSect` (and the `sect` dealbreaker) for non-LB members.
`memberSuggestStatus` must keep mirroring `generate` (no change expected: it calls the same dealbreaker code).

App (1.2.0, `naseebak_app/`): sect in setup, edit, preferences + «شرط أساسي», person details; the OTP screen
wording from a server field (`otpChannel` on `/api/countries`, fallback: SA = WhatsApp) instead of `== 'SA'`;
`formatGuardianPhone` knows 961; version bump. `flutter analyze` and `flutter test` green.

Checking Lebanon on production while it is off (builder's call): numbers in `EXTRA_TEST_PHONES` skip the
inactive / registration-closed block in `countrySignupBlock` (they only ever meet each other), so the owner can
walk the Lebanese flow on production. Admin → Countries «Send a test SMS» sends a real sign-in code through
`sendOtpCode` for a WhatsApp country, so VerifyWay to +961 can be checked before opening.

App version gate (builder's call): no per-country minimum version. Lebanon is switched on after 1.2.0 is live
and the existing global force update requires it.

Local QA: two Lebanese test numbers in `FIXED_OTP_PHONES` (`9613000001`, `9613000002`), and seed rows for LB
in `prisma/seed.mjs` (local only).

## Left to the builder

File-level order, test layout, exact town lists, Lebanese copy wording within the brand rules (no masculine
commands, «يمكنك …», Western digits, gendered copy helpers).

## Owner must decide or provide

1. Prices: credit packages and Pro plans for Lebanon (USD), then «Prices approved».
2. USD as Lebanon's currency (or another).
3. Legal: the entity and law named in terms/privacy/refund for Lebanon (drafts are written from Jordan's).
4. Support contacts for Lebanon (email, phone, WhatsApp) and the admin email list.
5. VerifyWay: confirm the account sends WhatsApp codes to +961 (same API key and template).
6. SMS notices in Lebanon: none, or a provider (Broadnet/Unifonic international) and sender id.
7. Sect values: سني / شيعي / «أفضّل عدم الذكر» now; whether to add others (e.g. درزي).
8. When to switch Lebanon on: after app 1.2.0 is live in both stores with the force update.
