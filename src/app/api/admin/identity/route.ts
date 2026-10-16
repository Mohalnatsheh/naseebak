import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { parsePagination } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const url = new URL(request.url);
    const tab = url.searchParams.get("tab") || "pending";
    const { page, pageSize, skip } = parsePagination(url.searchParams, 20);

    if (tab === "history") {
      const [docs, total] = await Promise.all([
        db.identityDoc.findMany({
          where: { status: { not: "PENDING" } },
          skip,
          take: pageSize,
          orderBy: { reviewedAt: "desc" },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, gender: true },
            },
            reviewedBy: {
              select: { firstName: true, lastName: true },
            },
          },
        }),
        db.identityDoc.count({ where: { status: { not: "PENDING" } } }),
      ]);

      return NextResponse.json({
        docs,
        total,
        page,
        totalPages: Math.ceil(total / pageSize),
      });
    }

    // Default: pending — include profile photos so admins can compare them with the selfie
    const docs = await db.identityDoc.findMany({
      where: { status: "PENDING" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            gender: true,
            photos: { select: { id: true, url: true }, orderBy: { order: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ docs });
  } catch (error) {
    console.error("Admin identity error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json().catch(() => null);
    const { docId, action, reviewNotes, rejectionReason } = body ?? {};

    if (typeof docId !== "string" || !docId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const existing = await db.identityDoc.findUnique({ where: { id: docId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const doc = await db.identityDoc.update({
      where: { id: docId },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        reviewNotes: reviewNotes || null,
        rejectionReason: action === "reject" ? (rejectionReason || null) : null,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
    });

    if (action === "approve") {
      // Approving never lifts a suspension: a suspended user goes back to VERIFIED when unsuspended
      const user = await db.user.findUnique({ where: { id: doc.userId }, select: { status: true } });
      const suspended = user?.status === "SUSPENDED";
      await db.user.update({
        where: { id: doc.userId },
        data: {
          isVerified: true,
          verifiedAt: new Date(),
          ...(suspended ? { statusBeforeSuspension: "VERIFIED" } : { status: "VERIFIED" }),
        },
      });
    } else {
      // Verification is optional — a rejected selfie only removes the verified badge,
      // it does not block or reject the account itself.
      await db.user.update({
        where: { id: doc.userId },
        data: {
          isVerified: false,
          verifiedAt: null,
        },
      });
    }

    const identityTitle = action === "approve" ? "تم التحقق من هويتك" : "لم يتم التحقق من الحساب";
    const identityBody = action === "approve"
      ? "تهانينا! تم التحقق من هويتك بنجاح وأصبح حسابك يحمل شارة الحساب الموثّق."
      : `لم يتم منح شارة الحساب الموثّق.${rejectionReason || reviewNotes ? ` ${rejectionReason || reviewNotes}` : ""}`;

    await notify({
      userId: doc.userId,
      type: "IDENTITY",
      title: identityTitle,
      body: identityBody,
      url: "/dashboard",
    });

    return NextResponse.json({ message: action === "approve" ? "Identity approved" : "Identity rejected", doc });
  } catch (error) {
    console.error("Admin identity review error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
