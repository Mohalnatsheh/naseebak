import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth";
import { getCycleFlags, getSetting, setSetting } from "@/lib/settings";
import { db } from "@/lib/db";

async function state() {
  const [flags, chatRaw, migration] = await Promise.all([
    getCycleFlags(),
    getSetting("chat_enabled"),
    db.systemSetting.findUnique({ where: { key: "migration_new_cycle_v1" } }),
  ]);
  return {
    introRequests: flags.introRequests,
    chat: chatRaw === "true",
    creditsMigratedAt: migration?.value ?? null,
  };
}

export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    return NextResponse.json(await state());
  } catch (error) {
    console.error("Get new cycle settings error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const schema = z.object({ introRequests: z.boolean().optional(), chat: z.boolean().optional() });

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    if (parsed.data.introRequests !== undefined) {
      await setSetting("intro_requests_enabled", String(parsed.data.introRequests));
    }
    if (parsed.data.chat !== undefined) {
      await setSetting("chat_enabled", String(parsed.data.chat));
    }
    return NextResponse.json(await state());
  } catch (error) {
    console.error("Update new cycle settings error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
