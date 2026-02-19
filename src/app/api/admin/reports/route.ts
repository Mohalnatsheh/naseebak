import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const status = searchParams.get("status") || undefined;
    const limit = 20;

    const where = status ? { status: status as any } : {};

    const [reports, total] = await Promise.all([
      db.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, firstName: true, lastName: true } },
          reported: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.report.count({ where }),
    ]);

    return NextResponse.json({
      reports,
      total,
      pages: Math.ceil(total / limit),
      page,
    });
  } catch (error) {
    console.error("Admin reports error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

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
