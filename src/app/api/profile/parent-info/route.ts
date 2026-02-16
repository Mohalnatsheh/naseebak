import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", message: "Get parent/guardian info" },
    { status: 501 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Not implemented", message: "Submit parent/guardian info" },
    { status: 501 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Not implemented", message: "Update parent/guardian info" },
    { status: 501 }
  );
}
