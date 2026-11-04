import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import { getAdminCountry, userCountryWhere } from "@/lib/countries/server";

/**
 * Where a member uses Naseebak (admin list «Uses», owner request 2026-11-04): `app` = signed in to the app at least once
 * (platform from «Active by device», else their push device, else "unknown"); `web` = website devices seen since
 * 2026-11-04 (`activity_days`). A member with neither used the website before that (everyone could, the app came later).
 */
export interface MemberUses {
  app: "android" | "ios" | "unknown" | null;
  web: ("android" | "iphone" | "desktop")[];
}

async function usesOf(ids: string[]): Promise<Record<string, MemberUses>> {
  if (ids.length === 0) return {};
  const [sessions, devices, days] = await Promise.all([
    db.mobileSession.groupBy({ by: ["userId"], where: { userId: { in: ids } } }),
    db.pushDevice.findMany({ where: { userId: { in: ids } }, select: { userId: true, platform: true }, orderBy: { updatedAt: "desc" } }),
    db.activityDay.findMany({ where: { userId: { in: ids } }, select: { userId: true, source: true }, distinct: ["userId", "source"] }),
  ]);
  const out: Record<string, MemberUses> = Object.fromEntries(ids.map((id) => [id, { app: null, web: [] }]));
  for (const s of sessions) out[s.userId].app = "unknown";
  for (const d of devices) if (out[d.userId].app === "unknown") out[d.userId].app = d.platform === "ios" ? "ios" : "android";
  for (const d of days) {
    const u = out[d.userId];
    if (d.source === "APP_ANDROID" || d.source === "APP_IOS") u.app = d.source === "APP_IOS" ? "ios" : "android";
    else if (d.source === "APP_OTHER") u.app ??= "unknown";
    else if (d.source === "WEB_ANDROID") u.web.push("android");
    else if (d.source === "WEB_IPHONE") u.web.push("iphone");
    else if (d.source === "WEB_DESKTOP") u.web.push("desktop");
  }
  return out;
}

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const url = new URL(request.url);
    // Bad ?page values ("abc", "-3", "1e9x") fall back to page 1 instead of a 500
    const rawPage = url.searchParams.get("page");
    const pageNum = rawPage && /^\d{1,6}$/.test(rawPage) ? rawPage : "1";
    const { page, pageSize, skip } = parsePagination(new URLSearchParams({ page: pageNum }), 20);
    const search = url.searchParams.get("search") || "";
    const gender = url.searchParams.get("gender") || "";
    const status = url.searchParams.get("status") || "";
    const uses = url.searchParams.get("uses") || "";

    // Admin's selected country ("ALL" = every country)
    const where: Prisma.UserWhereInput = { ...userCountryWhere(await getAdminCountry(request)) };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    if (gender === "MALE" || gender === "FEMALE") {
      where.gender = gender;
    }

    // App users = signed in to the app at least once; website only = never
    if (uses === "app") where.mobileSessions = { some: {} };
    else if (uses === "web") where.mobileSessions = { none: {} };

    if (status === "FLAGGED") {
      where.isFlagged = true;
    } else if (status === "VERIFIED" || status === "PENDING" || status === "SUSPENDED" || status === "REJECTED") {
      where.status = status;
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          gender: true,
          country: true,
          role: true,
          status: true,
          isVerified: true,
          isDeactivated: true,
          isFlagged: true,
          matchCredits: true,
          verifiedAt: true,
          createdAt: true,
          identityDoc: { select: { status: true } },
          profile: { select: { isComplete: true, city: true } },
          photos: { select: { id: true, url: true, isPrimary: true }, orderBy: { order: "asc" } },
          _count: { select: { matchesAsFemale: true, matchesAsMale: true, photos: true } },
        },
      }),
      db.user.count({ where }),
    ]);

    const usesById = await usesOf(users.map((u) => u.id));
    return NextResponse.json({
      users: users.map((u) => ({ ...u, uses: usesById[u.id] })),
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Admin users error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
