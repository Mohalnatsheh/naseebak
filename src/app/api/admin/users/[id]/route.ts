import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordCredit } from "@/lib/credits";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

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
        isFlagged: true,
        flagReason: true,
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
        parentInfo: {
          select: {
            parentName: true,
            parentPhone: true,
            relationship: true,
            address: true,
            notes: true,
            shareConsentAt: true,
          },
        },
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

const MAX_CREDIT_DELTA = 1000;
const MAX_NOTE = 200;

/**
 * Admin edits on a user:
 * - credits: `{ creditsDelta, note }` adds/removes credits atomically (never below 0) and writes
 *   an ADMIN_ADJUST ledger row with the note
 * - flag: `{ isFlagged, flagReason }`
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { creditsDelta, note, isFlagged, flagReason } = body as Record<string, unknown>;

    const hasCredits = creditsDelta !== undefined;
    const hasFlag = typeof isFlagged === "boolean";
    if (!hasCredits && !hasFlag) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    let trimmedNote = "";
    if (hasCredits) {
      if (
        typeof creditsDelta !== "number" ||
        !Number.isInteger(creditsDelta) ||
        creditsDelta === 0 ||
        Math.abs(creditsDelta) > MAX_CREDIT_DELTA
      ) {
        return NextResponse.json(
          { error: `Credits change must be a non-zero whole number (max ±${MAX_CREDIT_DELTA})` },
          { status: 400 }
        );
      }
      trimmedNote = typeof note === "string" ? note.trim() : "";
      if (!trimmedNote) return NextResponse.json({ error: "A reason is required" }, { status: 400 });
      if (trimmedNote.length > MAX_NOTE) {
        return NextResponse.json({ error: `Reason must be at most ${MAX_NOTE} characters` }, { status: 400 });
      }
    }

    const exists = await db.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (hasCredits) {
      const delta = creditsDelta as number;
      // Atomic: a removal only applies when the balance covers it
      const res = await db.user.updateMany({
        where: { id, ...(delta < 0 && { matchCredits: { gte: -delta } }) },
        data: { matchCredits: { increment: delta } },
      });
      if (res.count === 0) {
        return NextResponse.json({ error: "Not enough credits to remove that many" }, { status: 409 });
      }
      await recordCredit({
        userId: id,
        delta,
        reason: "ADMIN_ADJUST",
        adminId: session.user.id,
        note: trimmedNote,
      });
    }

    if (hasFlag) {
      await db.user.update({
        where: { id },
        data: {
          isFlagged: isFlagged as boolean,
          flagReason: isFlagged === true && typeof flagReason === "string" && flagReason.trim() ? flagReason.trim() : null,
        },
      });
    }

    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, matchCredits: true, isFlagged: true, flagReason: true },
    });
    return NextResponse.json({ message: "User updated", user });
  } catch (error) {
    console.error("Admin user update error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
