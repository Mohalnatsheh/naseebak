/**
 * Admin «change gender» (owner, 2026-11-12): members who picked the wrong gender at sign-up.
 *
 * Their open cards were all with the wrong side, so every open shared card they are on closes
 * (`closedByChange`, so it never comes back as a second chance), the usual user-scoped refund
 * returns any unanswered paid «مهتم» on those cards (theirs and the other people's), the
 * gender-only answers are cleared so the member is asked the right ones, and a fresh top-up runs.
 *
 * Refused while the member has any match: a match row stores who is the woman and who the man,
 * so it can't follow the change. The member gets no notice (the admin contacts them).
 */
import type { Gender } from "@prisma/client";
import { db } from "@/lib/db";
import { autoSuggestForUser, clearSuggestCooldown } from "@/lib/matching/auto-suggest";
import { refundUnansweredInterests } from "@/lib/suggestions/mutual";

/** «شروط أساسية» keys that only fit one gender's partner */
const GENDER_ONLY_DEALBREAKERS = ["hijab", "beard"];

export type ChangeGenderResult =
  | { ok: true; from: Gender; to: Gender; closed: number; refunded: number }
  | { ok: false; error: "NOT_FOUND" | "NOT_MEMBER" | "SAME_GENDER" | "HAS_MATCH" };

export async function changeMemberGender(args: {
  userId: string;
  gender: Gender;
  adminId: string;
  reason: string;
  now?: Date;
}): Promise<ChangeGenderResult> {
  const { userId, gender, adminId, reason } = args;
  const now = args.now ?? new Date();

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      gender: true,
      role: true,
      profile: { select: { dealbreakers: true } },
      _count: { select: { matchesAsFemale: true, matchesAsMale: true } },
    },
  });
  if (!user) return { ok: false, error: "NOT_FOUND" };
  if (user.role !== "USER") return { ok: false, error: "NOT_MEMBER" };
  if (user.gender === gender) return { ok: false, error: "SAME_GENDER" };
  if (user._count.matchesAsFemale + user._count.matchesAsMale > 0) return { ok: false, error: "HAS_MATCH" };

  const closed = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { gender } });
    if (user.profile) {
      await tx.profile.update({
        where: { userId },
        data: {
          hijab: null,
          niqab: null,
          beard: null,
          prefHijab: null,
          prefBeard: null,
          dealbreakers: user.profile.dealbreakers.filter((k) => !GENDER_ONLY_DEALBREAKERS.includes(k)),
        },
      });
    }
    const res = await tx.suggestion.updateMany({
      where: { flow: "MUTUAL", status: "PENDING", OR: [{ recipientId: userId }, { candidateId: userId }] },
      data: { status: "EXPIRED", expiresAt: now, closedByChange: true },
    });
    return res.count;
  });

  console.info(
    `[admin-gender] admin=${adminId} user=${userId} ${user.gender}->${gender} closed=${closed} reason=${JSON.stringify(reason)}`,
  );

  let refunded = 0;
  if (closed > 0) {
    try {
      refunded = (await refundUnansweredInterests({ userId, now })).refunded;
    } catch (e) {
      // The morning job refunds what this missed
      console.error("[admin-gender] refunds:", userId, e);
    }
  }

  // Cards from the right side straight away; never fails the change
  clearSuggestCooldown(userId);
  autoSuggestForUser(userId).catch((e) => console.error("[admin-gender] top-up:", userId, e));

  return { ok: true, from: user.gender, to: gender, closed, refunded };
}
