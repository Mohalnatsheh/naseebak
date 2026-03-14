import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(searchParams, 20);
    const status = searchParams.get("status") || undefined;

    const where = status ? { status: status as any } : {};

    const [reports, total] = await Promise.all([
      db.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, firstName: true, lastName: true } },
          reported: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.report.count({ where }),
    ]);

    return NextResponse.json({
      reports,
      total,
      pages: Math.ceil(total / pageSize),
      page,
    });
  } catch (error) {
    console.error("Admin reports error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json();
    const { reportId, status, adminNote } = body;

    if (!reportId || !status) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    if (!["REVIEWED", "DISMISSED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const report = await db.report.update({
      where: { id: reportId },
      data: {
        status,
        adminNote: adminNote || null,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ message: "Report updated", report });
  } catch (error) {
    console.error("Admin report update error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
