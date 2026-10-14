import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";

export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const value = await getSetting("registration_open");
    return NextResponse.json({ registrationOpen: value === "true" });
  } catch (error) {
    console.error("Get registration setting error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json();
    if (typeof body.registrationOpen !== "boolean") {
      return NextResponse.json(
        { error: "registrationOpen must be a boolean" },
        { status: 400 }
      );
    }

    await setSetting("registration_open", String(body.registrationOpen));
    return NextResponse.json({
      message: "Setting updated",
      registrationOpen: body.registrationOpen,
    });
  } catch (error) {
    console.error("Update registration setting error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
