import { NextResponse } from "next/server";
import { isRegistrationOpen } from "@/lib/settings";

export async function GET() {
  try {
    const registrationOpen = await isRegistrationOpen();
    return NextResponse.json(
      { registrationOpen },
      {
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=30",
        },
      }
    );
  } catch {
    // Fail-open: if we can't check, allow registration
    return NextResponse.json({ registrationOpen: true });
  }
}
