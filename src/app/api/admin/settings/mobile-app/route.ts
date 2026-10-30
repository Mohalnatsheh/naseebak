import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getMobileAdminSettings, updateMobileConfig } from "@/lib/mobile-config";

export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    return NextResponse.json(await getMobileAdminSettings());
  } catch (error) {
    console.error("Get mobile app settings error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const error = await updateMobileConfig(await request.json().catch(() => null));
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json(await getMobileAdminSettings());
  } catch (error) {
    console.error("Update mobile app settings error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
