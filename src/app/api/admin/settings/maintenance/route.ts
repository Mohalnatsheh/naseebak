import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getMaintenanceState, setSetting } from "@/lib/settings";

const MAX_MESSAGE_LENGTH = 300;

export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    return NextResponse.json(await getMaintenanceState());
  } catch (error) {
    console.error("Get maintenance setting error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const body = await request.json();
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    if (body.message !== undefined && typeof body.message !== "string") {
      return NextResponse.json({ error: "message must be a string" }, { status: 400 });
    }

    if (typeof body.enabled === "boolean") {
      await setSetting("maintenance_mode", String(body.enabled));
    }
    if (typeof body.message === "string") {
      await setSetting("maintenance_message", body.message.trim().slice(0, MAX_MESSAGE_LENGTH));
    }

    return NextResponse.json(await getMaintenanceState());
  } catch (error) {
    console.error("Update maintenance setting error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
