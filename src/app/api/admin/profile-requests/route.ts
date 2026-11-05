import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { refreshOpenSuggestionsInBackground } from "@/lib/suggestions/refresh";
import { buildProfileUpdate } from "@/lib/admin/profile-changes";
import { enumParam, safePagination } from "@/lib/admin/query";
import { byUserCountry, getAdminCountry } from "@/lib/admin/country-filter";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

/** Pending requests oldest first; `?status=APPROVED|REJECTED` shows handled ones, latest first; `?id=` one request */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = safePagination(searchParams, 20);
    const status = enumParam(searchParams.get("status"), STATUSES) ?? "PENDING";
    const id = searchParams.get("id");
    // Admin's selected country ("ALL" = every country)
    const where = { ...(id ? { id } : { status }), ...byUserCountry(await getAdminCountry(request), "user") };

    const [requests, total] = await Promise.all([
      db.profileUpdateRequest.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true, firstName: true, lastName: true, gender: true,
              profile: true,
            },
          },
        },
        orderBy: status === "PENDING" ? { createdAt: "asc" } : { reviewedAt: "desc" },
      }),
      db.profileUpdateRequest.count({ where }),
    ]);

    return NextResponse.json({ requests, total, page, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    console.error("Admin profile requests error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    const { requestId, action, adminNote } = body;

    if (!requestId || typeof requestId !== "string" || !["APPROVED", "REJECTED"].includes(action)) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const updateRequest = await db.profileUpdateRequest.findUnique({
      where: { id: requestId },
    });

    if (!updateRequest || updateRequest.status !== "PENDING") {
      return NextResponse.json({ error: "Request not found or already reviewed" }, { status: 404 });
    }

    const note = typeof adminNote === "string" && adminNote.trim() ? adminNote.trim() : null;
    const updateData =
      action === "APPROVED" ? buildProfileUpdate((updateRequest.changes ?? {}) as Record<string, unknown>) : {};

    // Apply the changes and close the request together; the PENDING guard stops a double review
    const updated = await db.$transaction(async (tx) => {
      const claimed = await tx.profileUpdateRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status: action, adminNote: note, reviewedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      if (Object.keys(updateData).length > 0) {
        // Upsert: a request from a member who had no profile row yet must still apply (an update failed with P2025)
        await tx.profile.upsert({
          where: { userId: updateRequest.userId },
          create: { userId: updateRequest.userId, ...updateData },
          update: updateData,
        });
      }
      return tx.profileUpdateRequest.findUnique({ where: { id: requestId } });
    });

    if (!updated) {
      return NextResponse.json({ error: "Request not found or already reviewed" }, { status: 409 });
    }

    const approved = action === "APPROVED";
    // The profile changed: update the suggestions this person hasn't answered yet
    if (approved && Object.keys(updateData).length > 0) refreshOpenSuggestionsInBackground(updateRequest.userId);
    const title = approved ? "تمت الموافقة على تعديل ملفك" : "تم رفض تعديل ملفك";
    const baseBody = approved
      ? "تمت مراجعة طلب تعديل ملفك الشخصي والموافقة عليه."
      : "تمت مراجعة طلب تعديل ملفك الشخصي ولم تتم الموافقة عليه.";
    await notify({
      userId: updateRequest.userId,
      type: "SYSTEM",
      title,
      body: note ? `${baseBody} ملاحظة الإدارة: ${note}` : baseBody,
      url: "/dashboard/profile",
    });

    return NextResponse.json({
      message: action === "APPROVED" ? "Change approved" : "Change rejected",
      request: updated,
    });
  } catch (error) {
    console.error("Admin profile request review error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
