import { db } from "@/lib/db";
import { calculateCompleteness } from "@/lib/profile-completeness";
import { recordCredit } from "@/lib/credits";
import { notify } from "@/lib/notify";
import { getCycleFlags } from "@/lib/settings";
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // excludes 0/O/1/I/L

export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

/** Rewarded referrals per referrer: past this, the friend still gets +1 but the referrer nothing more */
export const MAX_REWARDED_REFERRALS = 10;

/**
 * Referral reward: when a referred user finishes their profile, the referee gets +1 credit and the
 * referrer +2 (up to MAX_REWARDED_REFERRALS times). New cycle: the finished short setup
 * (`profile.isComplete`, no guardian needed — owner decision 2026-10-18); legacy: 100% completeness.
 * Called after every save that can raise completeness (profile, guardian info, photos, personality
 * quiz). Claimed atomically, so it is paid at most once.
 */
export async function maybeAwardReferral(userId: string): Promise<void> {
  try {
    const referral = await db.referral.findUnique({
      where: { refereeId: userId },
      select: { id: true, referrerId: true, creditsAwarded: true },
    });
    if (!referral || referral.creditsAwarded) return;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        identityDoc: { select: { status: true } },
        profile: true,
        personalityResult: { select: { personalityType: true } },
        photos: { select: { id: true } },
        parentInfo: { select: { id: true, parentName: true } }, // legacy completeness only
      },
    });
    if (!user) return;
    const { introRequests: newCycle } = await getCycleFlags();
    const finished = newCycle ? !!user.profile?.isComplete : calculateCompleteness(user).total >= 100;
    if (!finished) return;

    const outcome = await db.$transaction(async (tx) => {
      // Counted before this claim: earlier rewarded referrals of the same referrer
      const rewardedBefore = await tx.referral.count({
        where: { referrerId: referral.referrerId, creditsAwarded: true },
      });
      const claim = await tx.referral.updateMany({
        where: { id: referral.id, creditsAwarded: false },
        data: { creditsAwarded: true, awardedAt: new Date() },
      });
      if (claim.count !== 1) return null;
      const referrerPaid = rewardedBefore < MAX_REWARDED_REFERRALS;
      await tx.user.update({ where: { id: userId }, data: { matchCredits: { increment: 1 } } });
      if (referrerPaid) {
        await tx.user.update({ where: { id: referral.referrerId }, data: { matchCredits: { increment: 2 } } });
      }
      return { referrerPaid };
    });
    if (!outcome) return;

    await recordCredit({ userId, delta: 1, reason: "REFERRAL", refId: referral.id });
    if (outcome.referrerPaid) {
      await recordCredit({ userId: referral.referrerId, delta: 2, reason: "REFERRAL", refId: referral.id });
    }
    await Promise.all([
      notify({
        userId,
        type: "SYSTEM",
        title: "مكافأة الإحالة",
        body: "تهانينا! حصلت على رصيد إضافي (+1) كمكافأة إحالة لاكتمال ملفك الشخصي.",
        url: "/dashboard/payments",
      }),
      outcome.referrerPaid &&
        notify({
          userId: referral.referrerId,
          type: "SYSTEM",
          title: "مكافأة الإحالة",
          body: "تهانينا! حصلت على رصيد إضافي (+2) لأن شخصاً دعوته أكمل ملفه الشخصي.",
          url: "/dashboard/payments",
        }),
    ]);
  } catch (error) {
    // Never fail the save that triggered this
    console.error("Referral award error:", error);
  }
}
