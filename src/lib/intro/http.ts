import { NextResponse } from "next/server";
import { IntroError } from "@/lib/intro/errors";

/** Turn a rule violation into `{ error, code }` with its status; anything else is a 500. */
export function introErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof IntroError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(`${context} error:`, error);
  return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
}
