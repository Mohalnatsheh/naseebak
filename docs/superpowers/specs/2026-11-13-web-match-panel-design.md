# Website: match full-profile panel (mockup gap 4)

Date: 2026-11-13. Status: approved by the owner in chat (option B, short design). Website only, behind the existing
switch `dashboard_redesign` (off). No server change.

## Why
The dashboard mockup (`docs/design-mockup/Naseebak-Dashboard-Redesign.pdf`, pages 8–9) gives each match a detail
view: photos (once revealed), key facts, all details, the steps and the shared guardian contact. Today the
«التوافقات» tab card (`src/components/matches/matches-view.tsx`) has two separate buttons, «عرض جميع التفاصيل»
(inline sections) and «عرض الصور» (inline gallery). The owner's rule since 2026-10-23 stays: every match is managed
on the suggestions page, so the detail opens as a panel over the list, not as its own page (owner chose B).

## Decisions
- Card (switch on): same header, status, chips, «خطوات التعارف» (`MatchIntroPanel`) and «إنهاء التوافق» as today;
  «عرض جميع التفاصيل» and «عرض الصور» are replaced by one «الملف كاملاً» button. Locked/closed cards: no button,
  as today (no photos, no details).
- Panel (same shell as the suggestion `ProfileSheet`: inline-end side panel ≥ md at 440 px, full-screen on phones,
  ✕/Esc/back close, focus returns): photos when `photosRevealed` and the match is open (loaded with the existing
  `/api/matches/[id]/photos` loader; tap opens the existing `ImageLightbox`); name, age, city, job, «توافق بتاريخ …»;
  «عنه/عنها»; every detail in one scroll via `CandidateDetails` `flat` (religion, sect included).
- Ruling (controller, after approval): the shared guardian contact is NOT repeated in the panel. It lives inside
  `MatchIntroPanel` on the card (with «اتصال» / «واتساب» already), which owns its own data; repeating it would mean a
  second copy of that state. Cost if wrong: one extra block later.
- Switch off: the tab renders exactly as today.

## Non-goals / anti-goals
No server/API change; no change to requests, chat, guardian consent, ending a match; never a photo on a closed or
unrevealed match; nothing that bypasses `MatchIntroPanel`.

## Approach
Extract the sheet shell (history `#profile` entry, StrictMode-safe removal, focus return, layout) from
`profile-sheet.tsx` into a shared `DetailSheet`, keep `ProfileSheet` on it unchanged in behaviour, and build
`MatchProfileSheet` on the same shell.
