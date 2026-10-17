import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

/** Mark a contact message handled (`{ handled: true }`) or open again (`{ handled: false }`) */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body.handled !== "boolean") {
      return NextResponse.json({ error: "handled (boolean) is required" }, { status: 400 });
    }
    const updated = await db.contactMessage.updateMany({
      where: { id },
      data: { handledAt: body.handled ? new Date() : null },
    });
    if (updated.count === 0) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin contact message update error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
