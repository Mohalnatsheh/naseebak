import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { memberSuggestStatus } from "@/lib/admin/members-suggest-reason";

/** Last active, open cards, open «مهتم» and why there are no suggestions. Read-only: never creates a card. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { id } = await params;
    const status = await memberSuggestStatus(id);
    if (!status) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json(status);
  } catch (error) {
    console.error("Admin member suggest status error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
