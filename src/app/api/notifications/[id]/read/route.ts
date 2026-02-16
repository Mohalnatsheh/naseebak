import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json(
    { error: "Not implemented", message: "Mark notification as read" },
    { status: 501 }
  );
}
