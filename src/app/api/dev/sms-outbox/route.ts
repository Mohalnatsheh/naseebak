import { NextResponse } from "next/server";
import { mockSmsAllowed } from "@/lib/countries/settings";
import { clearMockOutbox, readMockOutbox } from "@/lib/sms-mock";
import { normalizePhone } from "@/lib/validations/auth";

/**
 * Development only: the mock SMS outbox, so a local tester (or the app's integration test) can read a sign-up code
 * sent through the MOCK provider. 404 on any real server (same rule as the mock itself: never in production).
 * `GET /api/dev/sms-outbox?phone=0500000123` · `DELETE` clears it.
 */
function allowed() {
  return mockSmsAllowed();
}

export async function GET(request: Request) {
  if (!allowed()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const raw = new URL(request.url).searchParams.get("phone");
  return NextResponse.json({ messages: readMockOutbox(raw ? normalizePhone(raw) : undefined) });
}

export async function DELETE() {
  if (!allowed()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  clearMockOutbox();
  return NextResponse.json({ ok: true });
}
