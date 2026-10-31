import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteFromBunny, getBunnyPathFromUrl } from "@/lib/bunny";

/** { action: "stop" }: no longer shown to anyone (kept in the list with its numbers) */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (body?.action !== "stop") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const updated = await db.alert.updateMany({ where: { id, stoppedAt: null }, data: { stoppedAt: new Date() } });
    if (updated.count === 0 && !(await db.alert.findUnique({ where: { id }, select: { id: true } }))) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin stop alert error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;
    const alert = await db.alert.findUnique({ where: { id }, select: { imageUrl: true } });
    if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    await db.alert.delete({ where: { id } });
    const path = alert.imageUrl ? getBunnyPathFromUrl(alert.imageUrl) : null;
    if (path) await deleteFromBunny(path);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin delete alert error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
