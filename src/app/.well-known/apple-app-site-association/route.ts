import { NextResponse } from "next/server";
import { IOS_APP_ID } from "@/lib/mobile-config";

/** iOS Universal Links: naseebak.com member pages and referral links open the app (same pages as Android) */
export function GET() {
  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: [IOS_APP_ID],
            components: [
              { "/": "/dashboard", comment: "member home" },
              { "/": "/dashboard/*", comment: "member pages (notification and SMS links)" },
              { "/": "/register", comment: "referral links (?invitationCode=)" },
            ],
          },
        ],
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
