# Website Match Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** One «الملف كاملاً» on each «التوافقات» card opens a panel with the revealed photos and every detail, behind `dashboard_redesign`.
**Architecture:** Shared `DetailSheet` shell extracted from `ProfileSheet`; `MatchProfileSheet` on it; wired in `matches-view.tsx` when `counts.dashboardRedesign`.
**Tech Stack:** Next.js 16, React 19, shadcn Sheet, Vitest + Testing Library.
**Spec:** `docs/superpowers/specs/2026-11-13-web-match-panel-design.md`

## Global Constraints
- Brand tokens only, no raw hex, nothing under 12 px, tap ≥ 44, RTL logical props, gendered copy, Western digits.
- Switch off = today's «التوافقات» tab exactly. No server change.
- Never a photo on a closed/locked match or before `photosRevealed`.
- Client components import nothing at runtime from db modules.
- Done = `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build` green.

## Review Focus
1. Switch off renders today's card (both buttons, inline gallery). Test in Task 3.
2. Closed/blocked/inactive match: no «الملف كاملاً», no photos. Test in Task 3.
3. Photos failing to load: the panel shows a retry/error line, never "no photos". Test in Task 2.
4. ProfileSheet behaviour unchanged after the extraction (its existing tests). Task 1.
5. Opening the panel from one match then another (switching) keeps one `#profile` history entry. Task 1.

---
### Task 1: Extract `DetailSheet`
**Files:** create `src/components/shared/detail-sheet.tsx`; modify `src/components/suggestions/profile-sheet.tsx`; test `src/__tests__/components/detail-sheet.test.tsx`.
**Produces:** `DetailSheet({ open: boolean, openKey: string | null, onClose: () => void, title: string, menu?: ReactNode, footer?: ReactNode, children: ReactNode })` holding the Sheet layout, `#profile` history handling and focus return now in `ProfileSheet`; `ProfileSheet` renders through it.
- [ ] Tests: open/close via ✕, Escape and popstate; StrictMode single entry; switching `openKey` adds no entry; focus returns to opener. Existing `profile-sheet.test.tsx` and `redesign-view.test.tsx` pass unchanged.
- [ ] Implement by moving code (no behaviour change) → run both old and new tests → commit.

### Task 2: `MatchProfileSheet`
**Files:** create `src/components/matches/match-profile-sheet.tsx`; test `src/__tests__/components/match-profile-sheet.test.tsx`.
**Consumes:** `DetailSheet` (Task 1), `CandidateDetails` (`flat`), `ImageLightbox`, `MemberAvatar`.
**Produces:** `MatchProfileSheet({ match: MatchSummary | null, photos: {id,url}[] | undefined, photosFailed: boolean, onLoadPhotos: () => void, onClose: () => void })` where `MatchSummary` is the subset of the matches-view `Match` it reads (export a type from matches-view or a small types file).
- [ ] Tests: renders name, age, city, job, «توافق بتاريخ …», «عنه/عنها», every CandidateDetails label for a full partner; photos grid only when `photosRevealed` and open (calls `onLoadPhotos` once when needed); tapping a photo opens the lightbox; `photosFailed` shows an error line with retry; a closed match never renders photos.
- [ ] Implement → pass → commit.

### Task 3: Wire into «التوافقات» behind the switch
**Files:** modify `src/components/matches/matches-view.tsx`; test `src/__tests__/matches/match-panel-view.test.tsx`.
- [ ] Tests: switch off → «عرض جميع التفاصيل» and «عرض الصور» present (regression); switch on → one «الملف كاملاً» per open card, neither old button, clicking opens the panel for that match with its photos (via the existing loader); locked card → no button; `MatchIntroPanel` still on the card.
- [ ] Implement (reuse the existing photo loader/state `matchPhotos`; keep the old path untouched) → full checks (`pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build`) → commit. Add one line to CLAUDE.md's `dashboard_redesign` bullet: the «التوافقات» card's «الملف كاملاً» panel.
