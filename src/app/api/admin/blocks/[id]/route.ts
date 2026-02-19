import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
