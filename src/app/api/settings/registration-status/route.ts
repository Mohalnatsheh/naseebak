import { NextResponse } from "next/server";
import { getCycleFlags, isRegistrationOpen } from "@/lib/settings";

export async function GET() {
  try {
    const [registrationOpen, flags] = await Promise.all([isRegistrationOpen(), getCycleFlags()]);
    return NextResponse.json(
      // newCycle: the register page's "what's next" copy (a finished short setup is enough for suggestions)
      { registrationOpen, newCycle: flags.introRequests },
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
