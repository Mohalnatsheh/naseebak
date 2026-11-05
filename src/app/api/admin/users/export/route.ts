import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAdminCountry } from "@/lib/countries/server";
import { csvResponse } from "@/lib/admin/csv";
import { USER_SORTS, usersListWhere } from "@/lib/admin/list-filters";

const MAX_ROWS = 20000;

/** Users list as CSV, with the filters on screen. Phone numbers leave the site here, so each download is logged */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const params = new URL(request.url).searchParams;
    const users = await db.user.findMany({
      where: usersListWhere(params, await getAdminCountry(request)),
      orderBy: USER_SORTS[params.get("sort") || "joined"] ?? USER_SORTS.joined,
      take: MAX_ROWS,
      select: {
        firstName: true, lastName: true, phone: true, gender: true, country: true, role: true, status: true, isDeactivated: true,
        isFlagged: true, matchCredits: true, lastActiveAt: true, createdAt: true, profile: { select: { city: true, isComplete: true } },
      },
    });
    console.info(`[admin] users export by ${result.session.user.id}: ${users.length} rows (${params.toString() || "no filter"})`);
    return csvResponse(`naseebak-users-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["First name", "Last name", "Phone", "Gender", "Country", "City", "Credits", "Setup finished", "Status", "Flagged", "Paused", "Role", "Joined", "Last active"],
      ...users.map((u) => [
        u.firstName, u.lastName, u.phone, u.gender, u.country, u.profile?.city, u.matchCredits, u.profile?.isComplete ? "Yes" : "No", u.status,
        u.isFlagged ? "Yes" : "No", u.isDeactivated ? "Yes" : "No", u.role, u.createdAt.toISOString(), u.lastActiveAt?.toISOString(),
      ]),
    ]);
  } catch (error) {
    console.error("Admin users export error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
