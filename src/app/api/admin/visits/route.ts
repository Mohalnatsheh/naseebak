import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyMany } from "@/lib/notify";
import { safePagination, enumParam } from "@/lib/admin/query";
import type { VisitStatus } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = safePagination(searchParams, 20);
    const status = enumParam(searchParams.get("status"), VISIT_STATUSES);
    const where = status ? { status } : {};

    const [visits, total, byStatus] = await Promise.all([
      db.visitRequest.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          match: {
            include: {
              female: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  parentInfo: {
                    select: {
                      parentName: true,
                      parentPhone: true,
                      relationship: true,
                      address: true,
                      notes: true,
                    },
                  },
                },
              },
              male: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  parentInfo: {
                    select: {
                      parentName: true,
                      parentPhone: true,
                      relationship: true,
                      address: true,
                      notes: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.visitRequest.count({ where }),
      db.visitRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    // Counts for the filter chips, across all pages and statuses
    const counts: Record<string, number> = {};
    for (const row of byStatus) counts[row.status] = row._count._all;

    return NextResponse.json({ visits, total, page, totalPages: Math.ceil(total / pageSize), counts });
  } catch (error) {
    console.error("Admin visits error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

const visitStatusLabels: Record<VisitStatus, string> = {
  REQUESTED: "طلب زيارة مرسل",
  FAMILIES_CONTACTED: "تم التواصل مع العائلات",
  SCHEDULED: "تم تحديد موعد الزيارة",
  COMPLETED: "تمت الزيارة",
  CANCELLED: "ملغاة",
};

const VISIT_STATUSES = Object.keys(visitStatusLabels) as VisitStatus[];

/** "" clears a text field (null); undefined leaves it unchanged. */
function textField(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const { visitId, status, scheduledDate, location, adminNotes } = body;

    if (!visitId || typeof visitId !== "string" || !status) {
      return NextResponse.json({ error: "معرف الزيارة والحالة مطلوبان" }, { status: 400 });
    }
    if (!VISIT_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    let date: Date | null | undefined;
    if (scheduledDate === null || scheduledDate === "") date = null;
    else if (scheduledDate !== undefined) {
      date = new Date(scheduledDate);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "Invalid scheduled date" }, { status: 400 });
      }
    }

    const existing = await db.visitRequest.findUnique({ where: { id: visitId }, select: { status: true } });
    if (!existing) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    const visit = await db.visitRequest.update({
      where: { id: visitId },
      data: {
        status,
        scheduledDate: date,
        location: textField(location),
        adminNotes: textField(adminNotes),
      },
      include: {
        match: { select: { femaleId: true, maleId: true } },
      },
    });

    // Notify both users only when the status actually changed
    if (existing.status !== status) {
      await notifyMany([visit.match.femaleId, visit.match.maleId], {
        type: "VISIT_UPDATE",
        title: "تحديث طلب الزيارة",
        body: `تم تحديث حالة طلب الزيارة إلى: ${visitStatusLabels[status as VisitStatus]}`,
        url: "/dashboard/matches",
        metadata: { visitId: visit.id },
      });
    }

    return NextResponse.json({ message: "تم تحديث الزيارة", visit });
  } catch (error) {
    console.error("Admin visit update error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
