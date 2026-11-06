# Marketing and content

Polls, blog, SEO, analytics, live chat and the Pixel.

> Reference detail moved out of `CLAUDE.md` on 2026-11-06. If this file and `CLAUDE.md` differ, `CLAUDE.md` wins.

## Naseebak Question

Switch `engagement_polls_enabled` (default off; toggle in Admin → Naseebak Question, `/admin/polls`). One question is asked on Instagram (story poll + link sticker), on the public page `/poll` (`/poll/<slug>` for a given one; 404 while off or for a draft) and in the `PollCard` on the dashboard home (`src/components/engagement/`). Tables `polls` / `poll_votes` (additive). Logic in `src/lib/engagement/polls.ts`, db-free types/helpers in `poll-types.ts`, voter in `voter.ts`.

- **A new question every `poll_round_days` (3):** the admin queues questions («Add to queue» = DRAFT); when the running one reaches `Poll.endsAt` the oldest draft goes live (`rotatePollsIfDue`, claimed with conditional updates; run lazily on every read and by the daily job task `pollRotation`). With nothing queued the question keeps running and the daily job emails the admins (also a day ahead). «Start now» starts a draft at once (closes the running one); «Reopen» a closed one
- **Reward:** a member's first answer to a question earns `poll_reward_credits` (1; 0 = off, max 5) in the same transaction as the vote (`matchCredits` + ledger `POLL_REWARD`, `PollVote.rewardCredits`), so one per question. Visitors never earn, and public pages never mention credits (owner rule); the dashboard card shows the offer and the credit added
- **Voters:** a signed-in `USER` votes as a member (gender stored for the women/men split); anyone else as a visitor browser (cookie `nsb_pv`, only its sha256 stored); test accounts vote (and earn) with source `test` and are never counted. One vote, final (a repeat returns the first); 30 votes/hour per IP (`rateLimitDb`)
- **Results** show only after voting (or once closed) and from `MIN_POLL_RESULTS` = 10 counted votes; the women/men split from 10 member votes each
- **Admin:** settings (days per question, credits per answer, credits given so far), queue order (NEXT / QUEUE #n), edit (wording only once votes exist), delete (no votes), results by members/visitors/women/men/Instagram/dashboard, the tagged Instagram link (`pollShareUrl`) and a 1080×1920 «نتيجة سؤال نصيبك» story (`/admin/polls/[id]/story`, Download PNG via `html-to-image`, Cairo loaded on that page). GA event `poll_vote` on the public page. Marketing loop: `Marketing/strategy/ENGAGEMENT_FORMATS.md`
- **«سؤال نصيبك» per country (2026-11-06):** `Poll.country` (JO default, all questions up to then): each country has its own queue, running question, rotation and votes; `/poll` and `/sa/poll`, and `/poll/<slug>` opens only in its own country.
  - A member always gets their account's country (website and app, `/api/polls/current` reads it on the server, no app version); a visitor gets the URL's.
  - Round days, reward and the global switch stay shared.
  - New questions pick a country in Admin → Naseebak Question; the list follows the admin bar.
  - The queue-empty alert goes to that country's admin emails.
  - A country with nothing running starts its oldest draft on its own (a new country, or after an admin closes the running question).
  - `/sa/poll` is in the sitemap and indexable only while a question runs there (`pollCountries`).

## Blog and SEO

- **SEO and AI search (2026-11-06):** `/llms.txt` (`buildLlmsText` in `lib/seo.ts`: open countries, published posts), `<html lang>` ar-JO / ar-SA, country in the FAQ, about, contact and blog titles, FAQPage data on the home page too, Organization `slogan`/`knowsAbout`/`contactPoint`, «اقرأ أيضاً» (`relatedPosts`) and «فريق نصيبك» + «آخر تحديث» on posts. A bare `https://` address in a post's text becomes a link showing the site name, so posts can end with an «المصادر» list.
- **Automatic messages (2026-11-06):** Admin → Automatic messages (`/admin/notifications/automatic`, read-only) lists all live messages per country from `src/lib/notifications/automatic.ts`. The texts stay at their call sites; `src/__tests__/lib/automatic-notifications.test.ts` fails when a text in the list no longer matches the code, so change both. Wording rule: no masculine commands in shared messages (say «يمكنك …»), and keep `UNPAID_TITLE` and the «صفر: اشح» top-up line, which Admin Insights count by text.
- **Dashboard country:** `dashboard/layout.tsx` wraps the pages in `VisitorCountryProvider` with the member's own country, so links, month names and analytics follow the account, not the last public page.
- **Analytics per country:** GA4 user property `site_country` (register it as a custom dimension in GA to report on it), Meta `CompleteRegistration` carries `site_country`; the app already sends `country`. One GA property and one Pixel for both countries.
- **Blog per country (2026-11-06):** `BlogPost.country` (JO default, all posts up to then): `/blog` and `/blog/<slug>` show Jordan's, `/sa/blog` and `/sa/blog/<slug>` Saudi Arabia's; a post opens only under its own country (404 elsewhere), and the country switcher goes from a post to the other country's blog list. Chosen in the post form in Admin → Blog; the list there follows the country in the admin bar. `/blog` is in `LOCALIZED_PATHS`; `/sa/blog/:slug` also in `next.config.ts`. A source in `docs/blog/` may carry «الدولة:» in its header. First Saudi post: `mawaqe3-zawaj-fi-alsaudia` (2026-11-06, published into `blog_posts` on production).
- **Blog:** posts are plain text (no Markdown) managed in Admin → Blog and shown plain in the app; on the site `src/lib/blog-content.ts` + `PostContent` read that text into real blocks without changing it: a short line alone = `<h2>`, a short first line directly above text = `<h3>`, `•`/`-` lines = a list, and the first mention of another published post's title (whole, or the part before its colon) = a link to it.
  - A sentence ending (`.`, `:`, `،`…) keeps a line a paragraph.
  - Write new posts in that shape and quote mentions as the title before the colon; every category shows as a filter on `/blog` even with no published post.
  - Post sources in `docs/blog/` (header: title, slug, category, read time, excerpt; the body after `---` minus its title line is the stored content): `ta3arraf-ala-naseebak`, and since 2026-11-02 `marahel-alzawaj-fi-alordon` + `asilah-qabl-alkhutbah` (published straight into `blog_posts` on production).
  - Google Search Console is verified by the file `public/googlea24abd2b2829805d.html` — keep it; a new file in `public/` is served only after the app restarts (`next start` reads the folder at start)

## Live chat and Meta Pixel

- **Tawk.to live chat (2026-11-06):** `src/components/shared/live-chat.tsx`, website only (the Flutter app has no web view, so it needs an app version to appear there). Off in admin, `/pay`, `/payments`, `/dashboard/chats` (`isLiveChatOffPath`); it can't unload, so a client-side move hides it, as does any open menu or popup (`data-scroll-locked` on body), because Tawk sits above them. Phone offset 104px clears the bottom bars with the iPhone home-indicator area, also in a narrow desktop window (`tawkStyle`). No member identity is passed. Named in the privacy policy.
- **Meta Pixel (2026-11-06):** ID in Admin → Settings. Events: `PageView` on load and on client-side moves to public pages (`PublicTracking`), `CompleteRegistration` at website sign-up (`trackMetaEvent`). `isMarketingOffPath` keeps GTM and the Pixel off the dashboard, admin, `/pay`, `/payments`, `/login` and password pages, because their URLs can hold a payment key or a member's link. App sign-ups and payments never reach Meta.

## Analytics

- Google Analytics 4 (`G-39EEZNJBYD`, override with `NEXT_PUBLIC_GA_ID`) loads through `PublicTracking` (`src/components/shared/public-tracking.tsx`) on public pages **and the member dashboard** (since 2026-11-03, owner request); never in `/admin` (`isAnalyticsOffPath()`).
- GA's automatic page view is off (`send_page_view: false`): `PublicTracking` sends one per route change with `analyticsPageLocation()` (`src/lib/analytics.ts`) — on signed-in pages ids become `:id` (`/dashboard/chats/:id`), only `?tab=` is kept, hash dropped — and `gtag("set", {page_location})` so custom events carry the cleaned URL too.
- GTM and the Meta Pixel stay public-only (`isMarketingOffPath()`: `isPrivatePath()` plus `/pay`, `/payments`, `/login` and the password pages; the Pixel's automatic push-state page views are off and `PublicTracking` sends a `PageView` on moves to public pages).
- Fire custom events with `trackEvent()` from `src/lib/analytics.ts` (sign_up, login, otp_requested, profile_completed, personality_quiz_completed, photo_uploaded, verification_submitted, suggestion_response, interest_response, begin_checkout, payment_success, poll_vote, app_download_click `{place: banner | install_page}`, app_banner_closed — the dashboard ones now reach GA).
- Never send personal data in event params, and dashboard page titles must stay fixed labels (no names).
- **Requires** GA Admin → Data streams → web → Enhanced measurement → Page views → advanced: «Page changes based on browser history events» **off** — otherwise gtag also sends its own raw page view on every client-side move (dashboard ids included, page views doubled; seen in a local test 2026-11-03).
**One GA property for everything (checked 2026-11-04):** the website stream «الموقع» (`G-39EEZNJBYD`), «نصيبك iOS» and «نصيبك Android (Play)» (`com.naseebak.naseebakApp`) all send to the same property (558342209), so Realtime counts website + app together (split by Platform or Stream name); a fourth stream «نصيبك Android» (`com.naseebak.naseebak_app`, the app id before 1 Nov) gets no data and can be archived. The app's Firebase events are listed in Countries and the mobile app → App analytics; there is **no `purchase` event** yet (only `begin_checkout`) — owner said not now (needs an app version).
