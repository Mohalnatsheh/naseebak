import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { changeMemberGender } from "@/lib/admin/change-gender";

const MAX_REASON = 200;

const ERRORS = {
  NOT_FOUND: { status: 404, error: "User not found" },
  NOT_MEMBER: { status: 400, error: "Only member accounts have a gender to change" },
  SAME_GENDER: { status: 400, error: "The member already has that gender" },
  HAS_MATCH: {
    status: 409,
    error: "This member has a match. A match stores who is the woman and who is the man, so the gender can't be changed.",
  },
} as const;

/** `{ gender: "MALE" | "FEMALE", reason }`: see src/lib/admin/change-gender.ts */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const gender = body?.gender;
    if (gender !== "MALE" && gender !== "FEMALE") {
      return NextResponse.json({ error: "Gender must be MALE or FEMALE" }, { status: 400 });
    }
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!reason) return NextResponse.json({ error: "A reason is required" }, { status: 400 });
    if (reason.length > MAX_REASON) {
      return NextResponse.json({ error: `Reason must be at most ${MAX_REASON} characters` }, { status: 400 });
    }

    const res = await changeMemberGender({ userId: id, gender, adminId: result.session.user.id, reason });
    if (!res.ok) {
      const e = ERRORS[res.error];
      return NextResponse.json({ error: e.error, code: res.error }, { status: e.status });
    }
    return NextResponse.json(res);
  } catch (error) {
    console.error("Admin gender change error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
