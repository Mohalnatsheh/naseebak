import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { filterTip, filterTipText } from "@/lib/matching/filter-tip";

/** Website «جديدة» with nothing left: which of my own filters to ease, in words (null = none worth changing) */
export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const userId = result.session.user.id;
    const [tip, user] = await Promise.all([filterTip(userId), db.user.findUnique({ where: { id: userId }, select: { gender: true } })]);
    return NextResponse.json({ text: tip ? filterTipText(tip, user?.gender === "FEMALE") : null });
  } catch (error) {
    console.error("Filter tip error:", error);
    return NextResponse.json({ text: null });
  }
}
