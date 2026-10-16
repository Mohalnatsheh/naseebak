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

    const { id } = await params;

    const suggestion = await db.suggestion.findUnique({ where: { id } });
    if (!suggestion) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    await db.suggestion.delete({ where: { id } });

    return NextResponse.json({ message: "Suggestion deleted" });
  } catch (error) {
    console.error("Admin suggestion delete error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
