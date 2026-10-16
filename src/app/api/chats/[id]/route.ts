import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getConversation } from "@/lib/chat/service";
import { introErrorResponse } from "@/lib/intro/http";
import { getCycleFlags } from "@/lib/settings";

/** One conversation with messages: ?before=<iso> loads older, ?after=<iso> polls newer */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const url = new URL(request.url);
    const valid = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? v : undefined);
    const [data, flags] = await Promise.all([
      getConversation(id, result.session.user.id, {
        before: valid(url.searchParams.get("before")),
        after: valid(url.searchParams.get("after")),
      }),
      getCycleFlags(),
    ]);
    return NextResponse.json({ ...data, chatEnabled: flags.chat });
  } catch (error) {
    return introErrorResponse(error, "Get chat");
  }
}
