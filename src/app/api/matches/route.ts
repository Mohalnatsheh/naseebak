import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", message: "Get mutual matches" },
    { status: 501 }
  );
}
