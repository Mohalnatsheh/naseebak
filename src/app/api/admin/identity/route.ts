import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", message: "Admin: Get pending identity reviews" },
    { status: 501 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Not implemented", message: "Admin: Approve or reject identity" },
    { status: 501 }
  );
}
