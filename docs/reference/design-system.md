# Design system

One look for the website and the app (QA round 2 design pass, November 2026). The website's tokens are in
`src/app/globals.css` (`@theme`); the app's carry the same names in `naseebak_app/lib/core/theme/app_theme.dart`
(see `naseebak_app/CLAUDE.md`). If this file and `CLAUDE.md` differ, `CLAUDE.md` wins.

## Colour tokens

| Token | Use |
|---|---|
| `primary` (navy `#22476a`), `primary-deep`, `primary-2` | Main UI, buttons, the navy heroes and the night backdrop |
| `accent` (gold `#c19250`), `accent-soft` | Decoration, fills on navy, the seal and rules |
| `accent-ink` | Gold **text or icons on a light background** (gold itself fails contrast there): «شرط أساسي», my poll answer, counts in gold |
| `sand` | The majlis rooms: chat, family steps, guardian consent |
| `ink`, `muted-ink` | Body text and secondary text on light backgrounds |
| `emerald-`/`green-`, `amber-`, `destructive` | Success, pending or warning, error only |

- Gold fills only on navy. On white, buttons are navy and gold carries meaning as `accent-ink` text.
- Badges by meaning (`src/lib/nav-badges.ts`, the app's `BadgeTone`): red = act now (a family or chat request),
  gold = good news (someone said «مهتم»), navy = a plain count. «الاقتراحات» shows who said «مهتم» in gold when any,
  else the new cards in navy (website and app, one rule).
- No raw hex on member pages (`BRAND_HEX` only where CSS can't reach), no forbidden palettes, no text under 12 px, no
  endless decorative animation: `src/__tests__/components/design-guards.test.ts` fails otherwise.

## Type, radius, shadows, motion

- One Cairo scale: `text-display` (34/42), `text-display-sm` (28/36), `text-title` (22/30), `text-headline` (18/28),
  `text-body` (16/26), `text-label` (14/22, 600), `text-caption` (12). `tailwind-merge` knows them (`src/lib/utils.ts`).
  Headlines use `.font-display`. Big prices use `MoneyAmount` / `UsdLine` (`components/payments/money.tsx`): fixed-width
  digits, the currency smaller and muted.
- Radius 8 / 12 / 16 / 24 (`rounded-md`, `rounded-xl`, `rounded-card`, `rounded-sheet`). Shadows `shadow-float`,
  `shadow-dialog`.
- Motion tokens `--motion-press` 120 ms, `--motion-appear` 180 ms, `--motion-sheet` 280 ms, `--motion-seal` 600 ms, one
  ease. Under `prefers-reduced-motion` every animation and delay ends at once (global rule in `globals.css`); the app
  reads `MediaQuery.disableAnimations` (`AppMotion`).

## Layout

- `PageHeader` on every member page title. Two widths (`src/lib/page-width.ts`): `narrow` (`max-w-2xl`) and `wide`
  (`max-w-5xl`: home, suggestions, matches, payments, a chat room).
- **One banner slot** (`components/shared/banner-slot.tsx`) above the page title, at most one line, by priority
  (`pickBanner`): setup not finished > 0 credits with someone waiting > a family request > notifications off (snoozes
  7 days). Home places the slot itself under its greeting (`slotInPage`). Page tips are inline (`PageTip`), never in
  the slot. The guided notifications sheet is `PushSetupHost`, mounted once by `DashboardColumn`; open it with
  `openPushSetup()`.
- Desktop home has two columns (greeting, slot, what waits, today's suggestions | count tiles, chats, consent, profile
  strength); phones keep one.
- Public pages open on the landing's navy night with the gold eight-point star; the bar over them uses the white logo
  (`opensOnNavy`). Blog covers come from the site's brand photos by slug (`src/lib/blog-covers.ts`): objects, homes,
  hands, Amman scenery, never a face (all ten checked 2026-11-11).

## Shared components

- `MemberAvatar` (veil with initial and lock until photos are shown, gold ring when matched, Pro dot, the chat's time
  arc), the shared suggestion card (avatar, name, «31 سنة · عمّان», ring, three chips, the why line, navy «مهتم»,
  neutral «لا», 48 px), `CardSkeleton`, line-art empty states (inline SVG, no faces), `LoadError`.
- Signature touches: **S1** the match seal (`match-seal.tsx`, a gold star drawn in 600 ms around both initials;
  decorative next to visible words), **S2** the photo reveal (blur to sharp in 300 ms, once per photo and session,
  `src/lib/photo-reveal.ts`), **S3** the majlis (`.majlis`: sand with the star at 4% and a gold rule), **S4** the time
  arc (`chatTimeFraction`: the chat's days left as a thin gold arc; no arc without an end date).

## Names (one set, website and app)

Nav: «الرئيسية», «الاقتراحات», «التوافقات», «المحادثات», «حسابي» (app) / the sidebar's own pages. Suggestion tabs:
«جديدة», «مهتمون بك», «بانتظار ردّهم», and on the website «التوافقات». Notices and help texts use the same words;
`src/lib/notifications/automatic.ts` is kept in step (guard test).
