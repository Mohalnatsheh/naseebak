import { NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readFromBunny } from "@/lib/bunny";
import { parseRange } from "@/lib/chat/media";

/**
 * A chat photo or voice note, streamed to one of the two members (web session or app Bearer) or to an
 * admin's web session (never Bearer; every admin fetch is logged). Anyone else gets 404, as does a text
 * message. Media stays readable after a chat ends, like text, and across a block (reports stay possible).
 * The storage path never leaves the server: not in a header, not in a log.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const notFound = () => NextResponse.json({ error: "غير موجود" }, { status: 404 });
  try {
    const { id, messageId } = await params;
    const message = await db.message.findUnique({
      where: { id: messageId },
      select: {
        id: true, conversationId: true, kind: true, mediaPath: true, mediaType: true,
        conversation: { select: { match: { select: { femaleId: true, maleId: true } } } },
      },
    });
    if (!message || message.conversationId !== id || message.kind === "TEXT" || !message.mediaPath) return notFound();

    const member = await requireUser();
    const members = [message.conversation.match.femaleId, message.conversation.match.maleId];
    if ("error" in member || !members.includes(member.session.user.id)) {
      const admin = await requireAdmin();
      if ("error" in admin) return notFound();
      console.info(`[admin-chat-view] admin=${admin.session.user.id} chat=${id} media=${messageId} at=${new Date().toISOString()}`);
    }

    const file = await readFromBunny(message.mediaPath);
    if (!file) {
      console.error(`chat media read failed: message=${messageId} (missing)`);
      return notFound();
    }

    const size = file.length;
    const headers: Record<string, string> = {
      "Content-Type": message.mediaType || "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };
    const range = parseRange(request.headers.get("range"), size);
    if (range === "unsatisfiable") {
      return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    }
    if (range) {
      const part = file.subarray(range.start, range.end + 1);
      return new NextResponse(new Uint8Array(part), {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": String(part.length) },
      });
    }
    return new NextResponse(new Uint8Array(file), { status: 200, headers: { ...headers, "Content-Length": String(size) } });
  } catch (error) {
    const { messageId } = await params.catch(() => ({ messageId: "?" }));
    console.error(`chat media read failed: message=${messageId}:`, (error as Error)?.message?.split(":")[0]);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
