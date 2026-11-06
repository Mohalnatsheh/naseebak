import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { activatePoll } from "@/lib/engagement/polls";
import { pollBreakdown } from "@/lib/engagement/poll-admin";
import { pollInputSchema } from "@/lib/validations/poll";

type Ctx = { params: Promise<{ id: string }> };

/** One question with the full breakdown of its votes */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;
    const poll = await db.poll.findUnique({ where: { id } });
    if (!poll) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ poll, ...(await pollBreakdown(poll.id, poll.options)) });
  } catch (error) {
    console.error("[admin polls] get failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("edit"), poll: pollInputSchema }),
]);

/** activate (closes the running one) · close · edit (wording only once votes exist) */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    const poll = await db.poll.findUnique({ where: { id }, include: { _count: { select: { votes: true } } } });
    if (!poll) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = parsed.data;
    if (body.action === "activate") {
      await activatePoll(id, poll.country);
    } else if (body.action === "close") {
      if (poll.status !== "ACTIVE") return NextResponse.json({ error: "Only a running question can be closed" }, { status: 409 });
      await db.poll.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
    } else {
      const { question, options, note } = body.poll;
      const current = Array.isArray(poll.options) ? poll.options : [];
      // Once people voted, the answers keep their meaning: same number of options, wording fixes only
      if (poll._count.votes > 0 && options.length !== current.length) {
        return NextResponse.json({ error: "People already voted: options can be reworded, not added or removed" }, { status: 409 });
      }
      await db.poll.update({
        where: { id },
        data: { question, note: note ?? null, options: options.map((label, i) => ({ id: `o${i + 1}`, label })) },
      });
    }
    return NextResponse.json({ poll: await db.poll.findUnique({ where: { id } }) });
  } catch (error) {
    console.error("[admin polls] update failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** Only a question nobody voted on can be deleted (close it otherwise) */
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;
    const votes = await db.pollVote.count({ where: { pollId: id } });
    if (votes > 0) return NextResponse.json({ error: "People voted on this question: close it instead" }, { status: 409 });
    await db.poll.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin polls] delete failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
