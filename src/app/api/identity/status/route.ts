import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", message: "Identity verification status" },
    { status: 501 }
  );
}
