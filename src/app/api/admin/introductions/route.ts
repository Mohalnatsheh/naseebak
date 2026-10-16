import { NextResponse } from "next/server";
import type { IntroRequestStatus, IntroRequestType } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { personSearch } from "@/lib/admin/search";

const TYPES = ["FAMILY", "CHAT"];
const STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"];
const person = { select: { id: true, firstName: true, lastName: true } } as const;

/** Overview of introduction requests and chats. Message content is never returned. */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { searchParams } = new URL(request.url);
    const { page, skip, pageSize: take } = parsePagination(searchParams, 20);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    // Filter by person: a user id (from the user page) or a name/phone search
    const userId = searchParams.get("userId");
    const who = personSearch(searchParams.get("q"));
    const where = {
      ...(type && TYPES.includes(type) && { type: type as IntroRequestType }),
      ...(status && STATUSES.includes(status) && { status: status as IntroRequestStatus }),
      ...(userId
        ? { OR: [{ senderId: userId }, { receiverId: userId }] }
        : who && { OR: [{ sender: who }, { receiver: who }] }),
    };

    // Expiry is applied lazily when users read; settle overdue requests first so the numbers are right
    await db.introRequest.updateMany({
      where: { status: "PENDING", expiresAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });

    const [grouped, activeChats, total, requests] = await Promise.all([
      db.introRequest.groupBy({ by: ["status"], _count: true }),
      db.conversation.count({ where: { status: "ACTIVE", expiresAt: { gt: new Date() } } }),
      db.introRequest.count({ where }),
      db.introRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true, type: true, status: true, createdAt: true, respondedAt: true, expiresAt: true,
          sender: person, receiver: person,
        },
      }),
    ]);

    const count = (s: string) => grouped.find((g) => g.status === s)?._count ?? 0;
    return NextResponse.json({
      stats: {
        pending: count("PENDING"),
        accepted: count("ACCEPTED"),
        declined: count("DECLINED"),
        expired: count("EXPIRED"),
        activeChats,
      },
      requests,
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
    });
  } catch (error) {
    console.error("Admin introductions error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
