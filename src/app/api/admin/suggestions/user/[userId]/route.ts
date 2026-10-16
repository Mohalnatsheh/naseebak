import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const { userId } = await params;

    const selectOtherUser = {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
    } as const;

    const [asRecipient, asCandidate] = await Promise.all([
      db.suggestion.findMany({
        where: { recipientId: userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          compatibilityScore: true,
          status: true,
          source: true,
          createdAt: true,
          flow: true,
          expiresAt: true,
          recipientDecision: true,
          candidateDecision: true,
          candidate: { select: selectOtherUser },
        },
      }),
      db.suggestion.findMany({
        where: { candidateId: userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          compatibilityScore: true,
          status: true,
          source: true,
          createdAt: true,
          flow: true,
          expiresAt: true,
          recipientDecision: true,
          candidateDecision: true,
          recipient: { select: selectOtherUser },
        },
      }),
    ]);

    return NextResponse.json({ asRecipient, asCandidate });
  } catch (error) {
    console.error("Admin user suggestions error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
