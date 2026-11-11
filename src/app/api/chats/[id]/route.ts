import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getConversation } from "@/lib/chat/service";
import { introErrorResponse } from "@/lib/intro/http";
import { getChatDeleteEnabled, getCycleFlags } from "@/lib/settings";

/**
 * One conversation with messages: ?before=<iso>[&beforeId=<message id>] loads older (exact cursor with the id,
 * else inclusive), ?after=<iso> polls newer (inclusive). Clients merge by message id. A poll may add
 * &reactionsSince=<iso> (the last answer's `polledAt`, less a few seconds) to get `reactionUpdates`: the reactions of
 * older messages that changed since then (the polling fallback for the Ably `reaction` event), plus `deletedIds` and
 * `hiddenIds` (chat delete). `deleteEnabled` follows the `chat_delete_enabled` switch only; hides apply whatever it is.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const url = new URL(request.url);
    const valid = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? v : undefined);
    const [data, flags, deleteEnabled] = await Promise.all([
      getConversation(id, result.session.user.id, {
        before: valid(url.searchParams.get("before")),
        beforeId: url.searchParams.get("beforeId")?.slice(0, 64) || undefined,
        after: valid(url.searchParams.get("after")),
        reactionsSince: valid(url.searchParams.get("reactionsSince")),
      }),
      getCycleFlags(),
      getChatDeleteEnabled(),
    ]);
    return NextResponse.json({ ...data, chatEnabled: flags.chat, deleteEnabled });
  } catch (error) {
    return introErrorResponse(error, "Get chat");
  }
}
