import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { previewCreditMigration, runCreditMigration } from "@/lib/admin/credit-migration";

/** How many users the one-time top-up would touch (for the confirmation dialog). */
export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    return NextResponse.json(await previewCreditMigration());
  } catch (error) {
    console.error("Credit migration preview error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** Run the one-time top-up (same as scripts/new-cycle-migrate.mjs). Safe to call twice. */
export async function POST() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const res = await runCreditMigration(result.session.user.id);
    if (!res.ok) {
      const error = res.reason === "SWITCH_OFF" ? "Turn on family and chat requests first" : "The top-up already ran";
      return NextResponse.json({ error, ...res }, { status: 409 });
    }
    return NextResponse.json(res);
  } catch (error) {
    console.error("Credit migration error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
