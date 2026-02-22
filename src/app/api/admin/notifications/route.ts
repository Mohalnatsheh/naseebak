import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification, sendPushNotificationToMany } from "@/lib/onesignal";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const notifications = await db.notification.findMany({
      where: { type: "SYSTEM" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        body: true,
        isRead: true,
        createdAt: true,
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("Admin notifications error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, title, body: notifBody, url } = body;

    if (!title || !notifBody) {
      return NextResponse.json({ error: "Title and body are required" }, { status: 400 });
    }

    const pushUrl = url || "/dashboard";

    if (userId) {
      // Send to a specific user
      await db.notification.create({
        data: {
          userId,
          type: "SYSTEM",
          title,
          body: notifBody,
        },
      });

      sendPushNotification({
        userId,
        title,
        body: notifBody,
        url: pushUrl,
      });

      return NextResponse.json({ message: "Notification sent to user" });
    } else {
      // Send to all non-admin users
      const users = await db.user.findMany({
        where: { role: "USER" },
        select: { id: true },
      });

      if (users.length === 0) {
        return NextResponse.json({ message: "No users to notify" });
      }

      await db.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: "SYSTEM" as const,
          title,
          body: notifBody,
        })),
      });

      const userIds = users.map((u) => u.id);
      sendPushNotificationToMany(userIds, {
        title,
        body: notifBody,
        url: pushUrl,
      });

      return NextResponse.json({ message: `Notification sent to ${users.length} users` });
    }
  } catch (error) {
    console.error("Admin send notification error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
