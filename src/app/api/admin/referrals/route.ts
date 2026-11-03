import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { getAdminCountry, userCountryWhere } from "@/lib/admin/country-filter";

const person = { select: { id: true, firstName: true, lastName: true, phone: true } } as const;

/**
 * Sign-ups from invitation links (`referrals`), newest first, with totals and the top inviters.
 * Filtered by the admin's country (the new member's country); `?referrer=<userId>` lists one inviter's.
 * "Rewarded" = the new member finished setup and the credits were paid (src/lib/referral.ts).
 */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const url = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(url.searchParams, 20);
    const referrer = url.searchParams.get("referrer");
    const country = await getAdminCountry(request);

    const inCountry: Prisma.ReferralWhereInput = country === "ALL" ? {} : { referee: userCountryWhere(country) };
    const where: Prisma.ReferralWhereInput = referrer ? { ...inCountry, referrerId: referrer } : inCountry;

    const [referrals, total, rewarded, top] = await Promise.all([
      db.referral.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          creditsAwarded: true,
          awardedAt: true,
          referrer: person,
          referee: { select: { ...person.select, profile: { select: { isComplete: true } } } },
        },
      }),
      db.referral.count({ where }),
      db.referral.count({ where: { ...where, creditsAwarded: true } }),
      db.referral.groupBy({
        by: ["referrerId"],
        where: inCountry,
        _count: { _all: true },
        orderBy: { _count: { referrerId: "desc" } },
        take: 5,
      }),
    ]);

    const topUsers = await db.user.findMany({
      where: { id: { in: top.map((t) => t.referrerId) } },
      select: person.select,
    });
    const topInviters = top.flatMap((t) => {
      const user = topUsers.find((u) => u.id === t.referrerId);
      return user ? [{ ...user, count: t._count._all }] : [];
    });
    const inviters = referrer
      ? 1
      : (await db.referral.groupBy({ by: ["referrerId"], where: inCountry })).length;

    return NextResponse.json({
      referrals: referrals.map(({ referee: { profile, ...referee }, ...r }) => ({
        ...r,
        referee: { ...referee, setupDone: !!profile?.isComplete },
      })),
      stats: { total, rewarded, waiting: total - rewarded, inviters },
      topInviters,
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Admin referrals error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
