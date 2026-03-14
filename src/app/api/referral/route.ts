import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateReferralCode } from "@/lib/referral";

export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { referralCode: true },
    });

    if (!user) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    let referralCode = user.referralCode;

    // Lazy-generate referral code if user doesn't have one
    if (!referralCode) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateReferralCode();
        try {
          await db.user.update({
            where: { id: session.user.id },
            data: { referralCode: code },
          });
          referralCode = code;
          break;
        } catch {
          // Unique constraint violation — retry with a new code
          continue;
        }
      }

      if (!referralCode) {
        return NextResponse.json({ error: "فشل في إنشاء رمز الإحالة" }, { status: 500 });
      }
    }

    // Get referral stats
    const referrals = await db.referral.findMany({
      where: { referrerId: session.user.id },
      select: {
        id: true,
        creditsAwarded: true,
        awardedAt: true,
        createdAt: true,
        referee: {
          select: { firstName: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalReferrals = referrals.length;
    const completedReferrals = referrals.filter((r) => r.creditsAwarded).length;

    return NextResponse.json({
      referralCode,
      totalReferrals,
      completedReferrals,
      referrals,
    });
  } catch (error) {
    console.error("Referral GET error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
