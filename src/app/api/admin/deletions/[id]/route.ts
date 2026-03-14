import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;

    const request = await db.accountDeletionRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, cancelledAt: true },
    });

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (request.cancelledAt) {
      return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
    }

    await db.accountDeletionRequest.update({
      where: { id },
      data: { cancelledAt: new Date() },
    });

    await db.user.update({
      where: { id: request.userId },
      data: { isDeactivated: false },
    });

    return NextResponse.json({ message: "Deletion request cancelled, account reactivated" });
  } catch (error) {
    console.error("Admin deletion cancel error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
