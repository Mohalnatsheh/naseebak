import { NextResponse } from "next/server";
import { getMobileConfig, getMobileMaintenance } from "@/lib/mobile-config";

/**
 * Public: the app's version gate per platform (src/lib/mobile-config.ts) and maintenance mode (the app shows a
 * full-screen maintenance page while it is on). Read on start and on every resume.
 */
export async function GET() {
  try {
    const [config, maintenance] = await Promise.all([getMobileConfig(), getMobileMaintenance()]);
    return NextResponse.json({ ...config, maintenance });
  } catch (error) {
    console.error("[mobile] config failed:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
