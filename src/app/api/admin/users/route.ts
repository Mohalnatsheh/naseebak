import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const search = url.searchParams.get("search") || "";
    const gender = url.searchParams.get("gender") || "";
    const status = url.searchParams.get("status") || "";
    const limit = 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    if (gender === "MALE" || gender === "FEMALE") {
      where.gender = gender;
    }

    if (status === "VERIFIED" || status === "PENDING" || status === "SUSPENDED" || status === "REJECTED") {
      where.status = status;
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
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
          identityDoc: { select: { status: true } },
          profile: { select: { isComplete: true, city: true } },
          _count: { select: { matchesAsFemale: true, matchesAsMale: true } },
        },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({ users, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Admin users error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
