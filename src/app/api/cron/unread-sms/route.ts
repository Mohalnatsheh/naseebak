import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { runUnreadSms } from "@/lib/chat/unread-sms";

/**
 * Unread-message SMS (lib/chat/unread-sms.ts). Every 15 minutes:
 * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://naseebak.com/api/cron/unread-sms
 */
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runUnreadSms());
  } catch (error) {
    console.error("Unread SMS cron error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
