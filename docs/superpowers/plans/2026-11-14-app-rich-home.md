# App Rich Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the plain app home with the approved richer layout.
**Architecture:** `home_screen.dart` composes new widgets in `features/home/widgets/`; a small `FeedOpenRequest` lets home ask the suggestions screen to open one item.
**Tech Stack:** Flutter, Riverpod, go_router, `flutter test`.
**Spec:** `docs/superpowers/specs/2026-11-14-app-rich-home-design.md`

## Global Constraints
- App tokens only; text ≥ 12; tap ≥ 44; RTL; gendered copy; Western digits; no member photo before a match.
- Payments visibility exactly as today; old servers degrade to hidden blocks.
- Don't edit `lib/features/chat/` (read its providers only); suggestions answer logic unchanged.
- Each task ends with `cd naseebak_app && flutter analyze && flutter test <files>`; the last runs the full suite.

## Review Focus
1. Quiet member (all counts 0, no lists): navy card shows the quiet message, no empty sections. Task 1/3.
2. Test account / payments off: no «اشحن», no Pro tile. Task 3.
3. Tapping a home suggestion opens that person on the suggestions tab; answering there works as today. Task 2.
4. Feed/interested/chats load failures show the existing error-retry row, never a fake empty state. Task 2/3.
5. Large text (1.3×) at 360 dp: no overflow in the carousel or tiles. Task 2/3.

---
### Task 1: «خطوتك التالية» card
**Files:** create `naseebak_app/lib/features/home/widgets/next_step_card.dart` (`NextStepCard({required Counts counts, required bool female, MyProfile? profile})` + pure `nextStepFor(Counts, {MyProfile?}) → NextStepMessage{title, body?, ctaLabel, route}`); test `naseebak_app/test/home_next_step_card_test.dart`.
- [ ] Tests: priority order and texts per spec item 2 (request › likedYou › new › unread › quiet with profile < 100% › quiet complete), gendered forms, stats values, CTA routes.
- [ ] Implement → pass → commit.

### Task 2: Suggestion and interested cards + open-on-suggestions
**Files:** create `features/home/widgets/home_suggestion_card.dart`, `home_interested_card.dart`; add `FeedOpenRequest` (id + tab) next to `FeedTabRequest` in `features/discovery/suggestion_models.dart`, and in `suggestions_screen.dart` consume it once the item is loaded (switch tab, push `CandidateProfileScreen` for that item using the screen's existing open path); test `naseebak_app/test/home_people_cards_test.dart` and extend `suggestions_flow_test.dart`.
- [ ] Tests: carousel shows up to 5 cards with locked avatar, name/age, score pill, ≤ 3 chips, reason, «الملف كاملاً»; tapping one routes to `/suggestions` and the suggestions screen opens that item's profile; interested cards show «مخفية» and never an Image, «ردّك مجاني» only with the flag; hidden when lists are empty; error-retry rows on failure; 360 dp × 1.3 text no overflow.
- [ ] Implement → pass → commit.

### Task 3: Compose the new home (chats, tiles, poll, tips)
**Files:** modify `features/home/home_screen.dart`; create `features/home/widgets/home_tiles.dart`, `home_chats_block.dart`, `home_tips.dart`; update `test/home_redesign_test.dart`; new `test/home_rich_test.dart`.
- [ ] Tests: section order per spec; chats block shows latest 2 from `chatListProvider` only when chat on or hasChats; tiles: «اشحن» only with app payments, Pro tile under today's gate («فعّالة» when Pro), profile tile only < 100%; poll inline only with an active question; quiet member shows «نصائح لك» and no empty sections; `_Once` re-read still runs.
- [ ] Implement → full `flutter analyze && flutter test` → commit. Add one line to `naseebak_app/CLAUDE.md` next-version note.
