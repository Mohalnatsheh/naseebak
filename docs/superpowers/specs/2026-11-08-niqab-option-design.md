# Niqab option — design

Date: 2026-11-08 · Owner decisions (2026-11-08): profile **and** partner preference, both countries (JO + SA),
ships with app 1.0.1 (Play). Not behind a switch: it is an extra answer, nothing existing changes meaning.

## Data (additive)

- New column `Profile.niqab Boolean?` (`prisma/schema.prisma`, next to `hijab`). Women only. null = not answered.
- Invariant, enforced on the server in every write path (`PUT /api/profile`, `PATCH /api/profile/draft`,
  `POST /api/profile/update-request`, admin approval in `src/lib/admin/profile-changes.ts`):
  - `niqab === true` ⇒ store `hijab = true`.
  - `hijab === false` ⇒ store `niqab = false`.
  - A body without `niqab` leaves it untouched (old app 1.0.0 never sends it). Never null it by omission.
- The member's answer is one question «الحجاب» with three choices:
  «محجبة» (hijab true, niqab false) · «منتقبة» (hijab true, niqab true) · «غير محجبة» (hijab false, niqab false).
- Edits after setup follow the existing rules: niqab null → a value is "filling an empty field" (direct save);
  changing a stored value goes to review like `hijab` (add `niqab` to the update-request field list, to
  `BOOL_FIELDS` in `profile-changes.ts` and to the admin labels "Niqab").

## Preference

- `prefHijab` (string) keeps its stored values «نعم» / «لا» / «لا يهم» and gains **«منتقبة»**. Stored values never change.
- `prefYesNo("منتقبة")` returns `"yes"` (so every existing hijab check still treats it as "wants hijab").
- New helper `wantsNiqab(v) = v === "منتقبة"` in `src/lib/matching/score.ts`.
- Score: when `wantsNiqab`, the hijab detail is matched only if `other.niqab === true` (label stays «الحجاب»).
- Dealbreaker («شروط أساسية» hijab): when `wantsNiqab`, passes only if `other.niqab === true`; null → fails
  (same as today's null hijab). `dealbreaker-summary.ts` describes it («منتقبة»).
- `memberSuggestStatus` must keep mirroring `generate` (it uses the shared score helpers; check).
- Website and app show the choice «منتقبة» in the men's preference question next to نعم / لا / لا يهم.

## Showing it

- Every API that returns `hijab` for a person also returns `niqab` (suggestions, feed, interests/received,
  matches, `/api/profile`, `/api/me`-style profile reads). Additive fields only.
- Display value for «الحجاب»: «منتقبة» if niqab, else «محجبة» / «غير محجبة» — website candidate details,
  matches view, own profile page, admin user page; app person details, own profile, edit screen.
- Admin user page: Hijab row shows "Niqab" when niqab is true.

## Old app 1.0.0

- Keeps sending `hijab` true/false only: true leaves niqab as is; false clears it (invariant above).
- Its preference screen shows no chip selected when `prefHijab` is «منتقبة»; saving keeps the stored value.
- Shows «محجبة» for a woman with niqab (hijab is true). Accepted until the force update to 1.0.1.

## Out of scope

No change to profile completeness (hijab stays the required answer), copy elsewhere, or analytics.
