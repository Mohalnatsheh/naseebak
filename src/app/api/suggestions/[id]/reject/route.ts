import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Not implemented", message: "Reject a suggestion" },
    { status: 501 }
  );
}
