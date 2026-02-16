import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", message: "Admin: Get visit requests" },
    { status: 501 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Not implemented", message: "Admin: Update visit status" },
    { status: 501 }
  );
}
