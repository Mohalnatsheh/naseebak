# Blurred Photo Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Locked avatars before a match show a server-made, strongly blurred 16 px preview of the member's main photo (website + app); the real photo never reaches a client before a match.

**Architecture:** A server lib turns a photo into a tiny pre-blurred WebP data URI stored on `Photo.blurPreview`; photo routes keep it current; one shared helper adds `photoPreview` to every pre-match payload about another member. Website and app `MemberAvatar` render it when locked. A backfill script plus a morning task fill existing photos. A default-on setting `photo_blur_preview` can turn it off.

**Tech Stack:** Next.js 16 / Prisma 7 / sharp 0.34 / Vitest; Flutter (Riverpod) app.

**Spec:** `docs/superpowers/specs/2026-11-14-blurred-photo-preview-design.md` (approved 2026-11-14).

## Global Constraints

- Before a match a client receives only `photoPreview: string | null` (a `data:image/webp;base64,…` ≤ 1 KB) for another member, never a photo `url`, path or larger copy.
- The preview is made from an already strongly blurred image, then resized so the longest side is 16 px; metadata stripped; result > 1 KB → null.
- Source photo: `isPrimary`, else lowest `order`. Upload, delete, reorder and set-primary recompute or clear the member's previews in the same request.
- `photoPreview` appears only in payloads about another member that do not send real photos: suggestion feeds/cards, candidate full profile, home blocks, «مهتمون بك» / «بانتظار ردّهم», alerts showing a member. Never in match, chat, admin or my-own-profile payloads.
- Setting `photo_blur_preview` (`system_settings`, read through `src/lib/settings.ts`), default **on**; off → every payload sends `photoPreview: null`.
- Schema change additive only (`Photo.blurPreview String?`); deploy with `--db-push` first.
- Old apps ignore the field. App part = next app version (after 1.4.0).
- Copy: «مخفية حتى التوافق» → «ضبابية حتى التوافق»; «الصور تظهر بعد التوافق المتبادل فقط» → «الصور تظهر بوضوح بعد التوافق المتبادل فقط»; landing/trust «الصور مخفية حتى التوافق» → «الصور ضبابية حتى التوافق»; privacy/FAQ get one sentence (draft, owner approves before deploy).
- Website rules (root `CLAUDE.md`): tokens only, no `@/lib/db` runtime imports in client components, `pnpm lint` 0, production build passes. App rules (`naseebak_app/CLAUDE.md`).

## Review Focus

1. A member with no photos, or whose only photo failed to process: initial veil, no broken image. (Task 1 + Task 4/5 tests)
2. Deleting the main photo while another remains: the preview switches to the next photo in the same request. (Task 1 test)
3. A matched pair: match/chat payloads carry real photos and no `photoPreview`; nothing changes there. (Task 2 guard test)
4. Setting off: every payload `photoPreview: null` within the settings cache window. (Task 2 test)
5. A huge or HEIC/odd photo during backfill: logged, left null, job continues. (Task 3 test)

---

### Task 1: Preview generation and photo routes

**Files:** Create `src/lib/photos/blur-preview.ts`; modify `prisma/schema.prisma` (`Photo.blurPreview String?`), `src/app/api/profile/photos/route.ts`, `src/app/api/profile/photos/[id]/route.ts`; tests `src/__tests__/photos/blur-preview.test.ts`, `src/__tests__/api/profile-photos-preview.test.ts`.

**Interfaces — Produces:**
- `makeBlurPreview(input: Buffer): Promise<string | null>` — data URI or null (failure or > 1 KB).
- `refreshMemberPreviews(userId: string, db = prisma): Promise<void>` — ensures every photo row of the member has `blurPreview` (computes missing ones from the photo bytes via `readFromBunny` / `readLocalUpload` or the URL), no-op for rows that have one.
- `primaryPhotoPreview(photos: { isPrimary: boolean; order: number; blurPreview: string | null }[]): string | null`.

- [ ] Step 1: failing tests — `makeBlurPreview` on a real 800×600 JPEG fixture returns a string starting `data:image/webp;base64,` whose decoded image is ≤ 16 px on its longest side and ≤ 1 KB; on garbage bytes returns null. `primaryPhotoPreview` picks primary, else lowest order, else null. Route tests (DB mocked per `src/__tests__/intro/requests.test.ts` pattern): an upload stores `blurPreview` on the new row; deleting the primary leaves the next photo's preview as the member's; a failing `makeBlurPreview` still saves the photo (preview null).
- [ ] Step 2: run `npx vitest run src/__tests__/photos src/__tests__/api/profile-photos-preview.test.ts` — FAIL.
- [ ] Step 3: implement (sharp: `.rotate()`, `.blur(20)`, `.resize(16, 16, { fit: "inside" })`, `.webp({ quality: 40 })`, no metadata). Hook upload and delete/reorder/primary paths; generation failure never fails the upload.
- [ ] Step 4: tests PASS; `npx tsc --noEmit`; `DATABASE_URL=postgresql://<user>@localhost:5432/naseeb_push pnpm db:push && pnpm db:generate` locally.
- [ ] Step 5: commit (stage by path).

### Task 2: `photoPreview` in pre-match payloads + setting

**Files:** Create `src/lib/photos/preview-payload.ts`; modify every route/lib that serialises another member before a match (find them: suggestion feed builder `src/lib/suggestions/feed.ts` and its routes, candidate profile route, home/dashboard data routes, alerts that show a member); tests `src/__tests__/photos/preview-payload.test.ts` and a guard test.

**Interfaces — Consumes:** `primaryPhotoPreview` (Task 1). **Produces:** `previewSelect` (Prisma `select` fragment for `photos: { select: { isPrimary, order, blurPreview } }`), `withPhotoPreview<T>(card: T, photos, enabled: boolean): T & { photoPreview: string | null }`, `photoPreviewEnabled(): Promise<boolean>` (setting `photo_blur_preview`, default true).

- [ ] Step 1: failing tests — each pre-match payload includes `photoPreview` (string when the member has a preview, null otherwise); setting off → null; guard: serialising a feed card / candidate profile never yields a key `url`, `photos` or any string starting `http` that points at a photo; match/chat payloads contain no `photoPreview`.
- [ ] Step 2: run — FAIL. Step 3: implement via the shared helper (one query, no per-card round trip). Step 4: `pnpm lint && npx tsc --noEmit && npx vitest run` PASS. Step 5: commit.

### Task 3: Backfill script and morning task

**Files:** Create `scripts/backfill-photo-previews.mjs` (or `.ts` run like `scripts/score-distribution.ts`), add task `fillPhotoPreviews` in `src/lib/cron/` registered in `runDailyJobs()` (morning part); tests `src/__tests__/cron/photo-previews.test.ts`.

**Interfaces — Consumes:** `makeBlurPreview`, bytes readers from Task 1. **Produces:** `fillPhotoPreviews({ limit = 200 }): Promise<{ filled: number; failed: number }>` — rows with `blurPreview IS NULL`, oldest first; a failure is logged (never the URL in full: path only) and skipped; one attempt per row per run.

- [ ] Steps: tests (fills nulls, skips non-null, a throwing row doesn't stop the batch, respects limit) → FAIL → implement (script loops the same function until none left) → PASS → commit. Idempotent; never touches `User.updatedAt`.

### Task 4: Website avatar + copy

**Files:** `src/components/shared/member-avatar.tsx`, `src/components/shared/person-card.tsx`, the components that render a locked member avatar from the pre-match payloads (suggestion card, profile sheet, home-v2, «مهتمون بك» / «بانتظار ردّهم» lists), copy in `src/components` / `src/app/(ar)` (privacy, FAQ, landing trust tiles, «صوري» row); tests in `src/__tests__/components/`.

- [ ] Steps: tests — locked + `photoPreview` renders an `<img>` with the data URI and a CSS blur, lock badge kept, no initial; locked without preview → initial as today; unlocked → unchanged; copy strings present → FAIL → implement (plain `<img>` with `src` data URI is allowed here: add the targeted `eslint-disable-next-line @next/next/no-img-element -- data: preview` the project allows for data: images) → `pnpm lint && npx tsc --noEmit && npx vitest run && pnpm build` PASS → commit.

### Task 5: App avatar + copy

**Files:** `naseebak_app/lib/shared/widgets/brand_kit.dart` (`MemberAvatar` gains `String? preview`), the models/parsers that read pre-match cards (suggestion card, candidate profile, home people cards, interested/waiting lists) read `photoPreview` with a null default, the screens pass it; copy («صوري» row value, card/full-profile line, photos screen line); tests in `naseebak_app/test/`.

- [ ] Steps: tests — `MemberAvatar(locked: true, preview: dataUri)` shows an image (decoded `MemoryImage`) under an `ImageFiltered` blur with the lock badge and no initial; invalid data URI → initial, no crash; parsers keep null when absent → FAIL → implement → `flutter analyze` clean, `flutter test` PASS → commit.

### Task 6: Docs

- [ ] Root `CLAUDE.md` (Privacy: "Photos stay hidden until a mutual like" → blurred preview rule; app-version list) and `naseebak_app/CLAUDE.md` one bullet; privacy-policy sentence drafted in the page source marked for owner approval in the commit message. Commit.
