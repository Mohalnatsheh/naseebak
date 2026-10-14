import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const url = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(url.searchParams, 20);
    const search = url.searchParams.get("search") || "";
    const gender = url.searchParams.get("gender") || "";
    const status = url.searchParams.get("status") || "";

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

    if (status === "FLAGGED") {
      where.isFlagged = true;
    } else if (status === "VERIFIED" || status === "PENDING" || status === "SUSPENDED" || status === "REJECTED") {
      where.status = status;
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        skip,
        take: pageSize,
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
          isFlagged: true,
          matchCredits: true,
          verifiedAt: true,
          createdAt: true,
          identityDoc: { select: { status: true } },
          profile: { select: { isComplete: true, city: true } },
          photos: { select: { id: true, url: true, isPrimary: true }, orderBy: { order: "asc" } },
          _count: { select: { matchesAsFemale: true, matchesAsMale: true, photos: true } },
        },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({ users, total, page, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    console.error("Admin users error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
