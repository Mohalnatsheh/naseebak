import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { refundUnansweredInterests } from "@/lib/suggestions/mutual";

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

    // A shared suggestion is closed, never deleted: deleting it would lose a paid «مهتم» for good (the
    // refund needs the row) and the pair's history. Closed EXPIRED now, so the usual rule applies: an
    // «مهتم» the other side never answered is refunded.
    if (suggestion.flow === "MUTUAL") {
      if (suggestion.status !== "PENDING") {
        return NextResponse.json({ error: "This shared suggestion is already closed" }, { status: 409 });
      }
      const now = new Date();
      const { count } = await db.suggestion.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "EXPIRED", expiresAt: now },
      });
      if (count === 1) {
        for (const userId of [suggestion.recipientId, suggestion.candidateId]) {
          await refundUnansweredInterests({ userId, now }).catch((e) => console.error("Admin close refund:", e));
        }
      }
      return NextResponse.json({ message: "Suggestion closed" });
    }

    await db.suggestion.delete({ where: { id } });

    return NextResponse.json({ message: "Suggestion deleted" });
  } catch (error) {
    console.error("Admin suggestion delete error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
