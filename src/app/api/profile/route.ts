import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", message: "Get user profile" },
    { status: 501 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Not implemented", message: "Update user profile" },
    { status: 501 }
  );
}
