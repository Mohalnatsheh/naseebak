import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { setGuardianConsent } from "@/lib/intro/requests";
import { introErrorResponse } from "@/lib/intro/http";

/** Agree to share the guardian contact with the other family after an accepted family introduction */
export async function POST() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    await setGuardianConsent(result.session.user.id);
    return NextResponse.json({ message: "تم حفظ موافقتك" });
  } catch (error) {
    return introErrorResponse(error, "Guardian consent");
  }
}
