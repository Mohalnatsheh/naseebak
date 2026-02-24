import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

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
