import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";

const GTM_REGEX = /^GTM-[A-Z0-9]+$/i;
const FB_PIXEL_REGEX = /^\d+$/;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const gtmId = await getSetting("gtm_id");
    const fbPixelId = await getSetting("fb_pixel_id");
    return NextResponse.json({ gtmId, fbPixelId });
  } catch (error) {
    console.error("Get tracking settings error:", error);
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

    if (body.gtmId !== undefined) {
      const val = String(body.gtmId).trim();
      if (val !== "" && !GTM_REGEX.test(val)) {
        return NextResponse.json(
          { error: "Invalid GTM ID format. Expected GTM-XXXXXXX" },
          { status: 400 }
        );
      }
      await setSetting("gtm_id", val);
    }

    if (body.fbPixelId !== undefined) {
      const val = String(body.fbPixelId).trim();
      if (val !== "" && !FB_PIXEL_REGEX.test(val)) {
        return NextResponse.json(
          { error: "Invalid Facebook Pixel ID format. Expected numeric ID" },
          { status: 400 }
        );
      }
      await setSetting("fb_pixel_id", val);
    }

    const gtmId = await getSetting("gtm_id");
    const fbPixelId = await getSetting("fb_pixel_id");

    return NextResponse.json({
      message: "Tracking settings updated",
      gtmId,
      fbPixelId,
    });
  } catch (error) {
    console.error("Update tracking settings error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
