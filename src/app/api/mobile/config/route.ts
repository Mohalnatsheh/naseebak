import { NextResponse } from "next/server";
import { getMobileConfig } from "@/lib/mobile-config";

/** Public: the app's version gate per platform (src/lib/mobile-config.ts). Read on start and on every resume. */
export async function GET() {
  try {
    return NextResponse.json(await getMobileConfig());
  } catch (error) {
    console.error("[mobile] config failed:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
