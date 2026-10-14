import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

export async function GET() {
  try {
    const gtmId = await getSetting("gtm_id");
    const fbPixelId = await getSetting("fb_pixel_id");

    return NextResponse.json(
      {
        ...(gtmId ? { gtmId } : {}),
        ...(fbPixelId ? { fbPixelId } : {}),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=30",
        },
      }
    );
  } catch {
    return NextResponse.json({});
  }
}
