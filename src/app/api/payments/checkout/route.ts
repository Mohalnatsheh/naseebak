import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Not implemented", message: "Create checkout session" },
    { status: 501 }
  );
}
