import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { cancelIntroRequest } from "@/lib/intro/requests";
import { introErrorResponse } from "@/lib/intro/http";

/** The sender withdraws their own pending request (the credit is not refunded). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const res = await cancelIntroRequest({ requestId: id, userId: result.session.user.id });
    return NextResponse.json({ message: "تم إلغاء الطلب", ...res });
  } catch (error) {
    return introErrorResponse(error, "Cancel intro request");
  }
}
