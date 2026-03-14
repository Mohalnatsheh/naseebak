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

    const block = await db.block.findUnique({ where: { id } });
    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    await db.block.delete({ where: { id } });

    return NextResponse.json({ message: "Block removed" });
  } catch (error) {
    console.error("Admin block delete error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
