import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { currentAlertFor, webDeviceFromUserAgent } from "@/lib/alerts";

/** The popup alert waiting for me: ?platform=app (the mobile app) | web (the website dashboard, device from the user agent) → { alert | null } */
export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const platform = new URL(request.url).searchParams.get("platform") === "app" ? "app" : "web";
    const device = platform === "web" ? webDeviceFromUserAgent(request.headers.get("user-agent")) : undefined;
    return NextResponse.json({ alert: await currentAlertFor(result.session.user.id, platform, undefined, device) });
  } catch (error) {
    console.error("Current alert error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
