import { NextResponse } from "next/server";

export async function POST() {
  // Auth.js handles session invalidation client-side via signOut().
  // This endpoint exists for completeness and can be used for
  // server-side cleanup if needed in the future.
  return NextResponse.json({ message: "تم تسجيل الخروج بنجاح" });
}
