# Zero Side-Effect Refactors Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate dead code, deduplicate heavily repeated logic, and fix a pagination edge-case bug — all with zero behavioral side effects.

**Architecture:** Extract shared auth guards and pagination parsing into `src/lib/auth.ts` and `src/lib/utils.ts`. Collapse duplicated matching functions via delegation. Delete unreferenced components.

**Status:** ✅ COMPLETED — deployed to production on 2026-03-14. Commit `da37866`. Tasks 1–7 and 9 done. Task 8 (nav links) skipped — labels intentionally differ between sidebar and navbar.

**Tech Stack:** Next.js 16, TypeScript, Prisma, NextAuth.js 5, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Delete | `src/components/shared/section-header.tsx` | Dead component (0 references) |
| Modify | `src/lib/matching/score.ts` | Collapse duplicate matching functions |
| Modify | `src/lib/auth.ts` | Add `requireAdmin()` and `requireUser()` helpers |
| Modify | `src/lib/utils.ts` | Add `parsePagination()` helper |
| Modify | ~30 files in `src/app/api/admin/` | Use `requireAdmin()` |
| Modify | ~25 files in `src/app/api/` (non-admin) | Use `requireUser()` |
| Modify | ~17 API route files | Use `parsePagination()` |
| ~~Create~~ | ~~`src/lib/data/dashboard-nav.ts`~~ | ~~Shared nav link definitions~~ (SKIPPED — labels differ) |
| Modify | `src/components/shared/dashboard-sidebar.tsx` | Fix dead ternary |
| ~~Modify~~ | ~~`src/components/shared/dashboard-navbar.tsx`~~ | ~~Import shared nav links~~ (SKIPPED) |

---

## Chunk 1: Dead Code & Matching Dedup

### Task 1: Delete Dead `SectionHeader` Component

**Files:**
- Delete: `src/components/shared/section-header.tsx`

**Verification:** Serena `find_referencing_symbols("SectionHeader")` returned `{}` — zero imports anywhere.

- [x] **Step 1: Verify no references exist**

Run: `grep -r "SectionHeader" src/ --include="*.tsx" --include="*.ts" -l`
Expected: Only `src/components/shared/section-header.tsx` itself

- [x]**Step 2: Delete the file**

```bash
rm src/components/shared/section-header.tsx
```

- [x]**Step 3: Verify build**

Run: `pnpm build`
Expected: No errors

- [x]**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete unused SectionHeader component"
```

---

### Task 2: Deduplicate `checkPreferenceMatch` via Delegation

**Files:**
- Modify: `src/lib/matching/score.ts:115-181`
- Test: `src/__tests__/matching/score.test.ts`

**Context:** `checkPreferenceMatch` (lines 115–181) and `checkPreferenceMatchDetailed` (lines 256–325) contain identical preference-checking logic (age, city, education, marital status, religiosity, smoking, hijab, beard, children). The only difference: `Detailed` returns `{ score, details[] }` while the simple version returns just the `score` number. Both are exported and tested.

- [x]**Step 1: Run existing tests to establish baseline**

Run: `pnpm test -- --run src/__tests__/matching/score.test.ts`
Expected: All tests PASS

- [x]**Step 2: Replace `checkPreferenceMatch` body with delegation**

In `src/lib/matching/score.ts`, replace the entire body of `checkPreferenceMatch` (lines 115–181) with:

```typescript
export function checkPreferenceMatch(
  profile: ProfileForScoring,
  otherProfile: ProfileForScoring,
  otherGender: string
): number {
  return checkPreferenceMatchDetailed(profile, otherProfile, otherGender).score;
}
```

Keep `checkPreferenceMatchDetailed` unchanged — it is now the single source of truth.

- [x]**Step 3: Run tests to verify no regression**

Run: `pnpm test -- --run src/__tests__/matching/score.test.ts`
Expected: All tests PASS (same scores, same behavior)

- [x]**Step 4: Commit**

```bash
git add src/lib/matching/score.ts
git commit -m "refactor: deduplicate checkPreferenceMatch by delegating to Detailed variant"
```

---

### Task 3: Deduplicate `calculateCompatibility` via Delegation

**Files:**
- Modify: `src/lib/matching/score.ts:213-249`
- Test: `src/__tests__/matching/score.test.ts`

**Context:** `calculateCompatibility` (lines 213–249) and `calculateCompatibilityDetailed` (lines 343–417) duplicate the same weighted-scoring formula. `calculateCompatibilityDetailed` returns a full `CompatibilityBreakdown` object whose `.totalScore` uses the same `Math.round(Math.max(0, Math.min(100, ...)))` clamping.

- [x]**Step 1: Replace `calculateCompatibility` body with delegation**

In `src/lib/matching/score.ts`, replace the entire body of `calculateCompatibility` (lines 213–249) with:

```typescript
export function calculateCompatibility(userA: UserForScoring, userB: UserForScoring): number {
  return calculateCompatibilityDetailed(userA, userB).totalScore;
}
```

- [x]**Step 2: Run tests to verify no regression**

Run: `pnpm test -- --run src/__tests__/matching/score.test.ts`
Expected: All tests PASS

- [x]**Step 3: Run full build**

Run: `pnpm build`
Expected: No errors

- [x]**Step 4: Commit**

```bash
git add src/lib/matching/score.ts
git commit -m "refactor: deduplicate calculateCompatibility by delegating to Detailed variant"
```

---

## Chunk 2: Auth Guard Helpers

### Task 4: Create `requireAdmin()` Helper

**Files:**
- Modify: `src/lib/auth.ts`

**Context:** Every admin API route repeats this 4-line pattern ~45 times with inconsistent error messages ("Forbidden", "Unauthorized", "غير مصرح"):

```typescript
const session = await auth();
if (!session?.user?.id || session.user.role !== "ADMIN") {
  return NextResponse.json({ error: "..." }, { status: 403 });
}
```

- [x]**Step 1: Read current `src/lib/auth.ts` exports**

Verify existing exports: `auth`, `handlers`, `signIn`, `signOut`.

- [x]**Step 2: Add `requireAdmin()` to `src/lib/auth.ts`**

Add this import and function at the end of the file:

```typescript
import { NextResponse } from "next/server";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}
```

- [x]**Step 3: Verify build**

Run: `pnpm build`
Expected: No errors (new export, no consumers yet)

- [x]**Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "refactor: add requireAdmin() auth guard helper"
```

---

### Task 5: Migrate Admin Routes to `requireAdmin()`

**Files:**
- Modify: All `src/app/api/admin/**/route.ts` files (~20 files, ~45 handler functions)

**Pattern:** In each admin route handler, replace:

```typescript
import { auth } from "@/lib/auth";
// ...
const session = await auth();
if (!session?.user?.id || session.user.role !== "ADMIN") {
  return NextResponse.json({ error: "..." }, { status: 403 });
}
```

With:

```typescript
import { requireAdmin } from "@/lib/auth";
// ...
const result = await requireAdmin();
if ("error" in result) return result.error;
const { session } = result;
```

If the file has multiple handlers (GET + POST), apply to each. If `auth` is no longer used directly, update the import to only import `requireAdmin`.

- [x]**Step 1: Migrate all admin route files**

Apply the pattern to every file under `src/app/api/admin/`. Complete list:

- `admin/blocks/route.ts` (1 handler)
- `admin/blocks/[id]/route.ts` (1 handler)
- `admin/blog/route.ts` (2 handlers)
- `admin/blog/categories/route.ts` (2 handlers)
- `admin/blog/categories/[id]/route.ts` (2 handlers)
- `admin/blog/[id]/route.ts` (2 handlers)
- `admin/deletions/route.ts` (1 handler)
- `admin/deletions/[id]/route.ts` (1 handler)
- `admin/identity/route.ts` (2 handlers)
- `admin/notifications/route.ts` (2 handlers)
- `admin/payments/route.ts` (1 handler)
- `admin/payments/[id]/refund/route.ts` (1 handler)
- `admin/profile-requests/route.ts` (2 handlers)
- `admin/reports/route.ts` (2 handlers)
- `admin/settings/admins/route.ts` (2 handlers)
- `admin/settings/registration/route.ts` (2 handlers)
- `admin/settings/tracking/route.ts` (2 handlers)
- `admin/stats/route.ts` (1 handler)
- `admin/suggestions/route.ts` (2 handlers)
- `admin/suggestions/candidates/route.ts` (1 handler)
- `admin/suggestions/generate/route.ts` (1 handler)
- `admin/suggestions/user/[userId]/route.ts` (1 handler)
- `admin/suggestions/[id]/route.ts` (1 handler)
- `admin/support/route.ts` (2 handlers)
- `admin/users/route.ts` (1 handler)
- `admin/users/[id]/route.ts` (2 handlers)
- `admin/users/[id]/suspend/route.ts` (1 handler)
- `admin/visits/route.ts` (2 handlers)
- `admin/visits/[visitId]/feedback/route.ts` (1 handler)

- [x]**Step 2: Verify build**

Run: `pnpm build`
Expected: No errors

- [x]**Step 3: Run all tests**

Run: `pnpm test -- --run`
Expected: All tests PASS

- [x]**Step 4: Commit**

```bash
git add src/app/api/admin/
git commit -m "refactor: migrate all admin routes to requireAdmin() helper"
```

---

### Task 6: Create `requireUser()` Helper and Migrate User Routes

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: All `src/app/api/` non-admin authenticated routes (~25 files)

- [x]**Step 1: Add `requireUser()` to `src/lib/auth.ts`**

```typescript
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "غير مصرح" }, { status: 401 }) };
  }
  return { session };
}
```

- [x]**Step 2: Migrate user routes**

Apply the same pattern to all non-admin authenticated routes:

```typescript
const result = await requireUser();
if ("error" in result) return result.error;
const { session } = result;
```

Files to migrate (each handler that calls `auth()` and checks `session?.user?.id`):

- `blocks/route.ts`, `blocks/[id]/route.ts`
- `identity/status/route.ts`, `identity/upload/route.ts`
- `interests/received/route.ts`, `interests/[id]/accept/route.ts`, `interests/[id]/reject/route.ts`
- `matches/route.ts`, `matches/[id]/photos/route.ts`, `matches/[id]/reveal/route.ts`, `matches/[id]/visit-status/route.ts`
- `notifications/route.ts`, `notifications/preferences/route.ts`, `notifications/read-all/route.ts`, `notifications/unread-count/route.ts`, `notifications/[id]/read/route.ts`
- `payments/cancel/route.ts`, `payments/checkout/route.ts`, `payments/history/route.ts`, `payments/session-status/route.ts`
- `profile/route.ts`, `profile/avatar/route.ts`, `profile/deactivate/route.ts`, `profile/delete/route.ts`, `profile/draft/route.ts`, `profile/parent-info/route.ts`, `profile/personality-quiz/route.ts`, `profile/photos/route.ts`, `profile/photos/[id]/route.ts`, `profile/update-request/route.ts`
- `push/register/route.ts`
- `referral/route.ts`, `referral/apply/route.ts`
- `reports/route.ts`
- `suggestions/route.ts`, `suggestions/sent/route.ts`, `suggestions/[id]/like/route.ts`, `suggestions/[id]/reject/route.ts`
- `support/route.ts`
- `visits/[visitId]/feedback/route.ts`

- [x]**Step 3: Verify build and tests**

Run: `pnpm build && pnpm test -- --run`
Expected: No errors, all tests PASS

- [x]**Step 4: Commit**

```bash
git add src/lib/auth.ts src/app/api/
git commit -m "refactor: add requireUser() helper and migrate all user routes"
```

---

## Chunk 3: Pagination, Nav Links, Dead Ternary

### Task 7: Extract `parsePagination()` Utility

**Files:**
- Modify: `src/lib/utils.ts`
- Modify: ~17 API route files

- [x]**Step 1: Add `parsePagination()` to `src/lib/utils.ts`**

```typescript
export function parsePagination(searchParams: URLSearchParams, defaultSize = 10) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  return { page, pageSize: defaultSize, skip: (page - 1) * defaultSize };
}
```

- [x]**Step 2: Migrate routes using pagination**

In each file, replace the `parseInt(...page...)` + `limit`/`pageSize` + `skip` calculation with:

```typescript
import { parsePagination } from "@/lib/utils";
// ...
const { page, pageSize, skip } = parsePagination(searchParams, 20); // or 10, 9, etc.
```

Files to migrate (with their default page sizes):

- `admin/blocks/route.ts` (20)
- `admin/blog/route.ts` (10)
- `admin/identity/route.ts` (20)
- `admin/payments/route.ts` (20)
- `admin/reports/route.ts` (20)
- `admin/suggestions/route.ts` (20)
- `admin/support/route.ts` (20)
- `admin/users/route.ts` (20)
- `blog/route.ts` (9)
- `interests/received/route.ts` (10)
- `matches/route.ts` (10)
- `notifications/route.ts` (20)
- `payments/history/route.ts` (10)
- `suggestions/route.ts` (10)
- `suggestions/sent/route.ts` (10)
- `support/route.ts` (10)

Note: `admin/suggestions/candidates/route.ts` uses `limit` from searchParams (not pagination), so skip it.

- [x]**Step 3: Verify build and tests**

Run: `pnpm build && pnpm test -- --run`
Expected: No errors, all tests PASS

- [x]**Step 4: Commit**

```bash
git add src/lib/utils.ts src/app/api/
git commit -m "refactor: extract parsePagination() utility, fix missing Math.max guard in admin routes"
```

---

### Task 8: ~~Extract Shared Dashboard Nav Links~~ — SKIPPED

**Reason:** During implementation, discovered that the sidebar and navbar use intentionally different labels for the same routes (e.g., `"رصيد التوافقات"` vs `"الباقات والاشتراكات"` for payments). Extracting shared definitions would require awkward label-override mappings, adding complexity rather than reducing it. The nav arrays are small, static, and low-risk for desync.

~~- [x]**Step 1: Create `src/lib/data/dashboard-nav.ts`**~~

```typescript
import {
  Home, Sparkles, Heart, Bell, User, Camera, Brain,
  FileCheck, CreditCard, LifeBuoy, Gift,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  femaleOnly?: boolean;
}

export const mainLinks: NavLink[] = [
  { href: "/dashboard", label: "الرئيسية", icon: Home },
  { href: "/dashboard/suggestions", label: "الاقتراحات", icon: Sparkles },
  { href: "/dashboard/matches", label: "التوافقات", icon: Heart },
  { href: "/dashboard/notifications", label: "الإشعارات", icon: Bell },
  { href: "/dashboard/support", label: "الدعم", icon: LifeBuoy },
];

export const accountLinks: NavLink[] = [
  { href: "/dashboard/profile", label: "الملف الشخصي", icon: User },
  { href: "/dashboard/photos", label: "صوري", icon: Camera },
  { href: "/dashboard/personality-quiz", label: "اختبار الشخصية", icon: Brain },
  { href: "/dashboard/identity", label: "التحقق من الهوية", icon: FileCheck },
  { href: "/dashboard/payments", label: "رصيد التوافقات", icon: CreditCard },
  { href: "/dashboard/support", label: "الدعم والملاحظات", icon: LifeBuoy },
  { href: "/dashboard/referral", label: "ادعِ صاحبك", icon: Gift },
];
```

- [x]**Step 2: Update `dashboard-sidebar.tsx` to import from shared file**

Remove local `NavLink` interface, `mainLinks`, and `accountLinks` constants. Replace with:

```typescript
import { mainLinks, accountLinks, type NavLink } from "@/lib/data/dashboard-nav";
```

Keep `NavItem` component and all rendering logic unchanged.

- [x]**Step 3: Update `dashboard-navbar.tsx` to import from shared file**

Remove local `navLinks` and `secondaryLinks` constants. Import from shared file.
The navbar uses a subset — `navLinks` maps to `mainLinks` and `secondaryLinks` maps to a subset of `accountLinks`. Adjust imports accordingly:

```typescript
import { mainLinks, accountLinks } from "@/lib/data/dashboard-nav";

// Use mainLinks as navLinks, filter accountLinks for secondaryLinks
const secondaryLinks = accountLinks.filter(l =>
  ["/dashboard/profile", "/dashboard/identity", "/dashboard/payments", "/dashboard/support"].includes(l.href)
);
```

- [x]**Step 4: Verify build**

Run: `pnpm build`
Expected: No errors

- [x]**Step 5: Commit**

```bash
git add src/lib/data/dashboard-nav.ts src/components/shared/dashboard-sidebar.tsx src/components/shared/dashboard-navbar.tsx
git commit -m "refactor: extract shared dashboard nav link definitions"
```

---

### Task 9: Fix Dead Ternary in Sidebar

**Files:**
- Modify: `src/components/shared/dashboard-sidebar.tsx:146`

**Context:** Line 146 contains:
```tsx
className={cn("w-auto flex-shrink-0", collapsed && !mobile ? "h-8" : "h-8")}
```
Both branches produce `"h-8"` — the ternary is meaningless.

- [x]**Step 1: Replace with simple class string**

Change the line to:

```tsx
className="w-auto flex-shrink-0 h-8"
```

- [x]**Step 2: Verify build**

Run: `pnpm build`
Expected: No errors

- [x]**Step 3: Commit**

```bash
git add src/components/shared/dashboard-sidebar.tsx
git commit -m "refactor: remove meaningless ternary in sidebar logo className"
```

---

## Verification — ✅ PASSED

All checks passed on 2026-03-14 before production deploy:

1. **`pnpm build`** — ✅ compiled with zero errors
2. **`pnpm test -- --run`** — ✅ 199 tests passed (13 test files)
3. **Production deploy** — ✅ health check HTTP 200, commit `da37866`
4. **77 files changed**, +1099 / -1633 lines (net -534 lines removed)
