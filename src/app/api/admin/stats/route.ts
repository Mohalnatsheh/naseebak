import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", message: "Admin: Get platform statistics" },
    { status: 501 }
  );
}
