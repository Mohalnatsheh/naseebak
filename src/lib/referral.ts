import { db } from "@/lib/db";
import { calculateCompleteness } from "@/lib/profile-completeness";
import { recordCredit } from "@/lib/credits";
import { notify } from "@/lib/notify";
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // excludes 0/O/1/I/L

export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

/**
 * Referral reward: when a referred user's profile reaches 100%, the referee gets +1 credit
 * and the referrer +2. Called after every save that can raise completeness (profile, guardian
 * info, photos, personality quiz). Claimed atomically, so it is paid at most once.
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
        parentInfo: { select: { id: true, parentName: true } },
      },
    });
    if (!user || calculateCompleteness(user).total < 100) return;

    const awarded = await db.$transaction(async (tx) => {
      const claim = await tx.referral.updateMany({
        where: { id: referral.id, creditsAwarded: false },
        data: { creditsAwarded: true, awardedAt: new Date() },
      });
      if (claim.count !== 1) return false;
      await tx.user.update({ where: { id: userId }, data: { matchCredits: { increment: 1 } } });
      await tx.user.update({ where: { id: referral.referrerId }, data: { matchCredits: { increment: 2 } } });
      return true;
    });
    if (!awarded) return;

    await recordCredit({ userId, delta: 1, reason: "REFERRAL", refId: referral.id });
    await recordCredit({ userId: referral.referrerId, delta: 2, reason: "REFERRAL", refId: referral.id });
    await Promise.all([
      notify({
        userId,
        type: "SYSTEM",
        title: "مكافأة الإحالة",
        body: "تهانينا! حصلت على رصيد إضافي (+1) كمكافأة إحالة لاكتمال ملفك الشخصي.",
        url: "/dashboard/payments",
      }),
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
