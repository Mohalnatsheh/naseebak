import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Not implemented", message: "Admin: Create manual suggestion" },
    { status: 501 }
  );
}
