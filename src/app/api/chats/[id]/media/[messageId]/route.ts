import { NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readFromBunny } from "@/lib/bunny";
import { parseRange } from "@/lib/chat/media";
import { readMediaCached } from "@/lib/chat/media-cache";

/**
 * A chat photo or voice note, streamed to one of the two members (web session or app Bearer) or to an
 * admin's web session (never Bearer; every admin fetch is logged). Signed out: 401. A signed-in member of another
 * chat gets 404, as does a text message. Media stays readable after a chat ends, like text, and across a block (reports stay possible).
 * The storage path never leaves the server: not in a header, not in a log.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const notFound = () => NextResponse.json({ error: "غير موجود" }, { status: 404 });
  try {
    const { id, messageId } = await params;
    // Signed out (and no admin web session): 401 before anything is looked up, so the app knows to sign in again
    const member = await requireUser();
    let adminId: string | null = null;
    if ("error" in member) {
      const admin = await requireAdmin();
      if ("error" in admin) return member.error;
      adminId = admin.session.user.id;
    }

    const message = await db.message.findUnique({
      where: { id: messageId },
      select: {
        id: true, conversationId: true, kind: true, mediaPath: true, mediaType: true,
        conversation: { select: { match: { select: { femaleId: true, maleId: true } } } },
      },
    });
    if (!message || message.conversationId !== id || message.kind === "TEXT" || !message.mediaPath) return notFound();

    const members = [message.conversation.match.femaleId, message.conversation.match.maleId];
    if (!adminId && !("error" in member) && !members.includes(member.session.user.id)) {
      const admin = await requireAdmin();
      if ("error" in admin) return notFound();
      adminId = admin.session.user.id;
    }
    if (adminId) console.info(`[admin-chat-view] admin=${adminId} chat=${id} media=${messageId} at=${new Date().toISOString()}`);

    // Several Range requests per play: the bytes are read from Bunny once and kept for a minute
    const mediaPath = message.mediaPath;
    const file = await readMediaCached(message.id, () => readFromBunny(mediaPath));
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
