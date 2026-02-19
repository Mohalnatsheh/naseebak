import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        gender: true,
        role: true,
        status: true,
        isVerified: true,
        isDeactivated: true,
        matchCredits: true,
        verifiedAt: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
        personalityResult: {
          select: {
            personalityType: true,
            vector: true,
            createdAt: true,
          },
        },
        parentInfo: true,
        identityDoc: {
          select: {
            id: true,
            documentType: true,
            frontImageUrl: true,
            backImageUrl: true,
            status: true,
            rejectionReason: true,
            reviewNotes: true,
            reviewedById: true,
            reviewedAt: true,
            createdAt: true,
          },
        },
        photos: {
          select: { id: true, url: true, isPrimary: true, order: true, createdAt: true },
          orderBy: { order: "asc" },
        },
        subscriptions: {
          select: {
            id: true,
            plan: true,
            suggestionsLeft: true,
            status: true,
            autoRenew: true,
            startsAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        _count: {
          select: {
            receivedSuggestions: true,
            givenSuggestions: true,
            matchesAsFemale: true,
            matchesAsMale: true,
            payments: true,
            notifications: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Admin user detail error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { matchCredits } = body;

    if (typeof matchCredits !== "number" || matchCredits < 0) {
      return NextResponse.json({ error: "Invalid credits value" }, { status: 400 });
    }

    const user = await db.user.update({
      where: { id },
      data: { matchCredits },
      select: { id: true, firstName: true, lastName: true, matchCredits: true },
    });

    return NextResponse.json({ message: "Credits updated", user });
  } catch (error) {
    console.error("Admin user credits error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
