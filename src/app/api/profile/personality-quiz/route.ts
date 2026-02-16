import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", message: "Get personality quiz results" },
    { status: 501 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Not implemented", message: "Submit personality quiz answers" },
    { status: 501 }
  );
}
