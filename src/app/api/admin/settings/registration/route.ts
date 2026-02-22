import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const value = await getSetting("registration_open");
    return NextResponse.json({ registrationOpen: value === "true" });
  } catch (error) {
    console.error("Get registration setting error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
