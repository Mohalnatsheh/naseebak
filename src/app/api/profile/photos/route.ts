import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", message: "Get user photos" },
    { status: 501 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Not implemented", message: "Upload user photo" },
    { status: 501 }
  );
}
