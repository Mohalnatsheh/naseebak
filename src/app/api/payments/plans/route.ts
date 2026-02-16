import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", message: "Get available payment plans" },
    { status: 501 }
  );
}
