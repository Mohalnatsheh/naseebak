import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ModerationError, setSuspended } from "@/lib/admin/moderation";

/** Toggle suspension: suspends an active user, unsuspends (restoring the previous status) a suspended one. */
export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;
    const user = await db.user.findUnique({ where: { id }, select: { status: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const suspend = user.status !== "SUSPENDED";
    const { status } = await setSuspended(id, suspend, session.user.id);

    return NextResponse.json({
      message: suspend ? "Account suspended" : "Account reactivated",
      user: { id, status },
    });
  } catch (error) {
    if (error instanceof ModerationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "NOT_FOUND" ? 404 : 400 }
      );
    }
    console.error("Admin suspend error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
