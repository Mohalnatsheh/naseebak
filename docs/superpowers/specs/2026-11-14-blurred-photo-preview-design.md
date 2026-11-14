# Blurred photo preview before a match (website + app)

Date: 2026-11-14. Owner decisions taken in the session on 2026-11-14.

## Why

Before a match, a member's avatar shows only an initial on the navy veil with a lock, so nobody can tell whether the
other person has photos at all. The owner wants the locked avatar to show a strongly blurred version of the member's
photo, "just to show that this member has images".

## Owner decisions

- **Approach:** a tiny blurred copy made on the server (approach 1 below), not a camera badge.
- **Who:** every member with at least one photo, existing and new. No member switch to turn it off.
- **Where:** every locked avatar before a match, on the website and in the app: suggestion cards, the full profile,
  home cards, «مهتمون بك», «بانتظار ردّهم», and any other place that shows the veil for a member the viewer may
  not see unblurred yet.
- **Strength:** very strong: a copy 16 px on its longest side. Colours and a rough shape only; nothing
  recognisable.
- **Rollout:** live with the deploy, no admin switch (owner, aware that the project rule puts behaviour changes behind
  a switch).

## Goals

- A locked avatar of a member with photos shows the blurred preview of their primary photo (first by `order` when no
  primary) instead of the initial; the lock badge stays.
- A member without photos keeps today's veil with the initial.
- After a match nothing changes: the real photos show as today.

## Anti-goals (would make this a failure even if it "works")

- **The real photo, or any larger copy, reaching a client before a match.** The client only ever receives the 16 px
  copy. No URL, no path, no size that could be fetched or upscaled into a recognisable image.
- A preview that leaks anything a member hid: a member hidden from the viewer (blocked, test-account separation,
  paused, other country) shows nothing new, because the card itself isn't shown.
- Old app versions breaking.

## Approaches

1. **(Chosen) Server-made 16 px copy, sent inline.** On upload (and once for existing photos) the server makes a
   16 px WebP of the photo, stores it as a small data URI on the photo row, and card payloads carry it as
   `photoPreview`. The clients stretch it into the circle and add their own blur on top. The real photo never leaves
   the server before a match.
2. **Camera badge, no image** («📷 2»). Zero privacy exposure and much smaller. Rejected by the owner: they want
   the visual blur.
3. **Client-side blur of the real photo.** Rejected: the sharp photo would be downloaded to every viewer's device,
   which breaks «مخفية حتى التوافق» for anyone who looks at network traffic.

## How it's built

**Server**
- Schema (additive): `Photo.blurPreview String?`: a `data:image/webp;base64,…` string of the 16 px copy (a few
  hundred bytes).
- Generation with `sharp` (already a dependency): resize so the longest side is 16 px, light extra blur, WebP at low
  quality, strip metadata. Made when a photo is uploaded or replaced; a one-off backfill job fills existing rows (and
  a morning-job task picks up any row still null, small batches, idempotent).
- Payload: every API answer that today sends a member's card or profile to a viewer *before* a match adds
  `photoPreview: string | null`: the primary photo's `blurPreview`, or null when none. It is never sent once real
  photos are allowed (the match routes already send real photos). Old apps ignore the field.
- Caching unchanged: `/api/*` answers stay `private, no-store`.

**Website**
- `MemberAvatar` (and `PersonCard`'s avatar): when locked and `photoPreview` is set, render the preview stretched to
  the circle with a CSS blur on top, keep the lock badge, drop the initial. Same in every place that renders a locked
  member avatar.

**App** (next app version)
- `MemberAvatar` (`lib/shared/widgets/brand_kit.dart`) gets the same: `MemoryImage` from the data URI, scaled to the
  circle, an `ImageFiltered` blur on top, lock badge kept. Models read `photoPreview` with a null default.

**Copy (both platforms)**
- «صوري — مخفية حتى التوافق» → «ضبابية حتى التوافق».
- The card / full-profile line «الصور تظهر بعد التوافق المتبادل فقط» → «الصور تظهر بوضوح بعد التوافق المتبادل فقط».
- Photo upload screen: one line that a strongly blurred preview shows before a match.
- Privacy policy and FAQ: one sentence on the blurred preview. Landing/trust tiles that say photos are hidden until a
  match get the same wording change («الصور ضبابية حتى التوافق»).

## Constraints

- Additive schema; deploy with `--db-push` before the code runs.
- Website works on deploy; the app shows previews only in the next app version (older apps keep the initial).
- Design tokens only; no raw colours; RTL.

## Settled after the builder check

- **Notice (owner):** no notice to existing members; only the privacy policy, FAQ and screen wording change.
- **Opt-out (owner):** none, including members whose photos show a face without hijab or niqab.
- **The blur is baked in on the server (my call):** the 16 px copy is made from an already strongly blurred image
  (Gaussian blur, then resize), so the payload itself holds only soft colour; the client blur is cosmetic. Size cap
  1 KB per data URI; a larger result is discarded (null).
- **Which photo (my call):** the primary photo, else the first by `order`. Uploading, replacing, reordering, changing
  the primary or deleting a photo recomputes or clears the member's preview in the same request; deleting the last
  photo leaves none. Photos have no moderation state today, so nothing else gates it.
- **Where exactly (my call):** `photoPreview` is sent only in payloads that describe another member *and* do not send
  their real photos: suggestion feeds and cards, the candidate full profile, home blocks, «مهتمون بك» /
  «بانتظار ردّهم», alerts that show a member. Never in match, chat, admin or my-own-profile payloads. One shared
  server helper adds it, and a guard test fails if any pre-match card payload carries a photo `url`.
- **Backfill (my call):** a re-runnable script fills existing rows right after the deploy (fetches each photo from
  its URL, runs the same pipeline); a morning-job task picks up any row still null in small batches. A photo that
  fails (unreadable format, fetch error) stays null and the member keeps the initial; it is retried by the morning
  task at most once a day.
- **Storage (my call):** on `Photo.blurPreview`; the card query reads the primary photo's preview in the same query
  that already loads the card (no extra round trip per card).
- **Kill setting (my call, safety net):** a `system_settings` key `photo_blur_preview` that defaults to **on**: it
  launches live with the deploy as the owner chose, and setting it off makes the server send `photoPreview: null`
  (clients fall back to the initial) without a rollback.
- **Old apps:** keep the initial and their own «مخفية حتى التوافق» strings until they update; accepted. The app
  part needs the next app version (the one after 1.4.0).
- **Wording:** I draft the Arabic privacy/FAQ sentence; the owner approves it before the deploy.

## Left to the builder

- The exact list of API routes and components that render a locked avatar (find every one; a test should fail if a
  pre-match payload ever carries a photo `url`).
- The exact blur radius on top of the 16 px image on each platform (enough that it reads as a soft colour blob).
- Backfill mechanics (script vs morning task first run), as long as it is idempotent and safe to re-run.
