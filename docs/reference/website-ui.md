# Website UI

Dashboard and landing page patterns.

> Reference detail moved out of `CLAUDE.md` on 2026-11-06. If this file and `CLAUDE.md` differ, `CLAUDE.md` wins.

## Dashboard pagination

All list pages use server-side pagination. RTL chevron direction: `ChevronRight` = السابق (previous), `ChevronLeft` = التالي (next). Page sizes: 10 (suggestions, matches, payments, support), 20 (notifications).

```tsx
<Button onClick={() => setPage(page - 1)}><ChevronRight /> السابق</Button>
<Button onClick={() => setPage(page + 1)}>التالي <ChevronLeft /></Button>
```

## Landing page

- **Title dash on mobile:** Em-dash `—` hidden on mobile, replaced with `<br>`: `<span className="hidden sm:inline">—</span><br className="sm:hidden" />`
- **Blog/FAQ filter bars:** Use `flex flex-wrap justify-center gap-2`, never `overflow-x-auto`
- **Footer:** 4 columns. No newsletter section (intentionally removed)
- **Navbar section links:** Use `Link href="/#features"` for homepage anchors
- **Switch-aware public pages:** `src/app/(ar)/page.tsx` is a server component that reads `getCycleFlags()` and renders `src/components/landing/*` with copy from `content.ts`; FAQ answers come from `src/app/(ar)/faq/faq-data.ts` (`faqsFor()`), used by both the page and its JSON-LD. Never describe a feature that is switched off
- **Live numbers band** (`src/components/landing/reasons.tsx`, `/api/stats/public`): each number is hidden until it reaches its minimum (`MIN_PUBLIC_USERS = 100`, `MIN_PUBLIC_MATCHES = 20`) — a small count reads as an empty site
- **Landing design (2026-10-18 redesign):** navy night hero (`.landing-night`) with a faint gold khatam tile (`.landing-khatam`), one font, Cairo (`next/font` in `(ar)/layout.tsx`; headlines use `.font-display` = weight 800).
  - `LandingBody` (client) holds «أبحث عن زوجة / زوج», shared by the hero and final `StartForm`s.
  - `StartForm` hands gender + optional phone to `/register` via sessionStorage (`naseeb:register-start`, `src/lib/landing-start.ts`, 30 min, never the URL; register pre-fills them) and fires `landing_start`.
  - `StickyStart` = phone-only bottom bar while no form or the footer is on screen.
  - Sections (`landing-body.tsx`): hero → steps → product tour → trust → reasons (live numbers) → FAQ → final CTA.
  - The navbar turns light-on-dark at the top of `/`.
  - No accent-coloured words in headlines
- **Hero and product tour** show real product screens in `PhoneFrame`
- **Photos (made with Runway, Oct 2026):** warm editorial style in brand blue/gold, **never people's faces** (owner's rule for a halal marriage site; hands, homes, objects and Amman scenery only).
  - Homepage: `public/images/landing/*.webp` (hero, signup, profile, match, family, privacy band, cta).
  - Public pages: `public/images/pages/*.webp` via `PageHeroPhoto` (`src/components/shared/page-hero-photo.tsx`, faint photo fading into the page behind the hero title): about, blog, post (blog post hero + blog card covers), contact, faq, privacy, terms, auth (login side panel, register background).
  - Always `next/image`, WebP ≤ ~180 KB; dashboard pages stay photo-free on purpose
- **New images:** the Runway key is `RUNWAYML_API_SECRET`, only in the `.env.local` of the old Desktop checkout (never committed, not on the server, not in this checkout's env). API: `POST https://api.dev.runwayml.com/v1/text_to_image` (`X-Runway-Version: 2024-11-06`, model `gen4_image`, ~8 credits per 1080p image), then poll `GET /v1/tasks/{id}`; confirm the credit cost with the owner before generating
- **SEO (2026-11-02):** every public page builds its Open Graph + X card with `socialMetadata()` (`src/lib/seo.ts`) — a page's `openGraph`/`twitter` replace the layout's, so setting them by hand drops og:site_name/og:type and shows the home text on X. Pages under a dynamic segment (blog posts) don't get the `(ar)` opengraph-image: pass `image`. `/blog` and `/blog/[slug]` render on the server (`src/lib/blog.ts`, shared with `/api/blog/*`); the sitemap refreshes hourly and has no fake `lastmod`. `/dashboard`, `/admin`, `/payments/` are disallowed in robots and noindex
- **Home screens per country (2026-11-06):** `public/images/landing/product/sa/` holds real Saudi captures (780×1688 WebP, demo accounts in the local database: suggestion, choose, interested, match, chat); `screen()` in `landing/content.ts` picks them. Jordan's in `product/` are from 22 Oct and show the older tabs and bottom bar. The final call on `/sa` uses `hero.webp`, because `cta.webp` is Amman.

## Dashboard data context

- `DashboardDataProvider` in dashboard layout deduplicates API calls.
- Provides `profile`, `completeness`, `unreadCount`, `profileFailed` (the last `/api/profile` load failed; an earlier profile is kept, and with none the home page shows `LoadError` + retry instead of "finish your setup") and `counts` (`/api/me/counts`: switch flags, pending intro requests, unread chats, guardian consent, and with shared suggestions `newSuggestions` / `likedYou` from `countMutualTabs()` in `feed.ts` — two COUNT queries with the feed's rules; a failure there only drops those two fields).
- Polls every 30s, only while the tab is visible (`document.visibilityState`; a background tab would keep the member "recently seen" via `/api/me/counts`), and refreshes once when the tab is shown again.
- Listens for `naseeb:notifications-read` custom DOM event for instant badge updates.

## Dashboard home and push setup

- Dashboard home shows one `NextStepCard` (`src/components/dashboard/next-step-card.tsx`) plus one helper card at a time (guardian consent, else `InstallAppCard`, which only opens the guided setup).
- The welcome pop-up (`OnboardingGuide`) was removed on 2026-10-23 (owner decision).
- **Notifications setup (2026-10-19):** most members come from Instagram ads and browse inside Instagram's browser (no install, no push), so everything goes through one guided flow, `PushSetupFlow` (`src/components/shared/push-setup.tsx`): `pushStage()` (`install-env.ts`) picks the one next step — `browser` (one-tap «افتح في Safari/Chrome» via `openInBrowserUrl()`: `x-safari-https://…` on iPhone, a Chrome `intent://` on Android, landing on `/dashboard/install`, plus the manual ⋯ menu drawing and copy link), `install` (iPhone share → «إضافة إلى الشاشة الرئيسية» drawings), `allow` (big button + drawing of the system prompt), `blocked`, `done` — with a progress row.
- Android fallbacks: an Android browser without push gets `browser` (open Chrome); if the page is still visible 2.5s after «افتح في…» (or Chrome's intent fell back with `?nochrome=1`), it offers «افتح في متصفح آخر» (`openInAnyBrowserUrl`, default browser / chooser) and opens the manual steps; «تفعيل» with no pop-up (Chrome's quiet bell) shows the address-bar bell drawing + «حاول مرة أخرى»; blocked in Android Chrome shows the site-settings drawing.
- `OneSignalProvider` opts a device in when the browser already allows notifications but OneSignal isn't subscribed, and again on OneSignal's `permissionChange` to granted; a «تفعيل» answered by the browser prompt before the SDK was ready waits up to 10 s (`READY_WAIT_MS`) for `markOneSignalReady()` and then opts in (`push-client.ts`).
- Drawings, never screenshots.
- `NotificationBar` (`src/components/shared/notification-bar.tsx`) hosts `PushSetupSheet` (bottom sheet): a bar on every dashboard page except home (home has `InstallAppCard`), chat rooms, setup and the guide, whose button opens the sheet; the sheet never opens by itself (it stacked on the home card, 2026-10-23); `openPushSetup()` opens it from anywhere.
- «لاحقاً» on the bar hides it for 3 days (localStorage).
- Measure adoption with OneSignal's `messageable_players` (42 on 2026-10-19). iPhone web push only works when installed to the Home Screen — `InstallAppCard` and `/dashboard/install` (device-aware steps incl.
- Instagram/Facebook browsers, Samsung Internet, unblocking; `src/lib/install-env.ts`, `src/components/shared/install-guide.tsx`) handle it.

## Mobile layout

- **Mobile (2026-10-23):** a bottom tab bar «الرئيسية · التوافقات · المحادثات · حسابي» in `DashboardSidebar` — «التوافقات» = `/dashboard/suggestions` (also active on `/dashboard/matches`, badge = `likedYou` + `pendingIntros`), «حسابي» opens the `/dashboard/account` page (profile header with photo, age/city, completion and balance, then every account page in groups and sign-out; phones have no slide-out menu, the desktop sidebar is unchanged), notifications live behind the top-bar bell.
- The suggestions page is titled «التوافقات» with four categories (2×2 on phones): «الجديد» / «مهتمون بالتحدث معك» / «أنا مهتم بالتحدث معهم» (feed tabs `new` / `interested` / `waiting`) and «توافق متبادل» (`?tab=matches`, renders `MatchesView embedded` from `src/components/matches/matches-view.tsx`; owner decision 2026-10-23: every match managed in one place).
- The tab is kept in `?tab=` (history push + popstate; a load-sequence guard drops stale answers).
- `/dashboard/matches` now redirects there keeping `?match=` (old notification links), or shows `MatchesView` alone when shared suggestions are off; in-app links use `matchesHref()` (`src/lib/matches/links.ts`).
- «شروطي الأساسية» (`DealbreakersCard`) is a filter bar at the top of «الجديد»: active conditions as chips, editor in a bottom sheet; `#dealbreakers` in the URL opens it.
- Home = a slim greeting row; `NextStepCard` only while the profile setup is unfinished; a «بانتظار ردّك» card only when something needs an answer (pending intro requests → the match, «مهتمون بالتحدث معك» → `?tab=interested`, new suggestions → «الجديد»; a recharge line when «مهتم» needs a credit); up to 3 active chats; one helper card; profile strength while < 100%.
- The التوافقات page shows no balance (top bar and «حسابي» do).
- Opening a page clears the bell for the notices that lead there (`markPageNotificationsRead()` → `POST /api/notifications/read-for-page`, same mapping as `notificationUrl()`; suggestions, matches, payments, chats list `exact`, each chat room). main has bottom padding for it; the top bar shows the credit balance with credit on interest.
- Small text fields (`text-sm`/`text-xs`) are bumped to 16px on phones in `globals.css` so iPhone never zooms on focus — keep chat/inputs ≥ 16px.

## Dashboard look

**Dashboard look (2026-10-18, matches the landing):** page titles always via `PageHeader` (`src/components/shared/page-header.tsx`: gold-ringed icon, `font-display` title (Cairo, weight 800 — the site uses one font), optional count pill, actions as children) — never hand-built gradient boxes or gradient text. Home = one navy `.landing-night` + `.landing-khatam` header with the greeting, `NextStepCard variant="hero"` (gold action) and the three counts; profile strength is a ring + the top tip, details folded in `<details>`. `PersonCard`: gold conic `ScoreRing`, names in `font-display`. Sidebar active marker is gold.

## Dashboard UI rules

**Dashboard UI rules** (UI/UX audit 2026-10-18): buttons grow to 44px on touch (`pointer-coarse:min-h-11` in `ui/button.tsx`) — keep tap targets ≥ 44px; dialog/sheet close ✕ sits at `end-2` (left in Arabic) and dialogs scroll on short screens; a failed load shows `LoadError` (`src/components/shared/load-error.tsx`, message + «إعادة المحاولة») — never a fake empty state, and never let a form save after its data failed to load; dashboard pages wait for the first `/api/me/counts` switch flags before rendering (no legacy-flow flash); gendered copy via `forViewer()` / `forPartner()` / `blockConfirmText()` (`src/lib/gendered-copy.ts`); use the shadcn `DropdownMenu`/`Dialog`, never `window.confirm` or hand-made overlays; member photos use `next/image` with `unoptimized` (private photos aren't cached by the image optimizer); «إعدادات الحساب» in the menu jumps to pause/delete (pause amber, delete red); «إنهاء التوافق» is the one term for ending a match.

## UI gotchas

- UI gotchas: profile setup drafts in localStorage are keyed to their owner (`useAutoSave` — never restore another user's draft); photos go through `compressImage()` (`src/lib/image-compress.ts`) before `/api/profile/photos` (5MB limit; `PATCH /api/profile/photos/[id]` sets the main photo); call `maybeAwardReferral()` (`src/lib/referral.ts`) after any save that raises completeness (new cycle: paid once the short setup is finished, no guardian needed — owner decision 2026-10-18; legacy: 100%; the referrer's +2 stops after `MAX_REWARDED_REFERRALS` = 10, the friend's +1 always); login → register hands phone + OTP via `sessionStorage` (never in the URL); use `arabicCount()` for counted nouns and gender-aware copy (partner gender = opposite of the viewer's).
- **Client components ("use client") must never import a runtime value from a module that imports `@/lib/db`** (feed.ts, settings.ts, credits.ts, intro/*, matching/*) — it breaks `next build` (pg pulls `fs`) even though tsc/vitest pass; put shared types/pure helpers in a db-free module (e.g. `src/lib/suggestions/feed-types.ts`) and use `import type`.
- Run `pnpm build` (or the Docker build) before calling UI work done.
