import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendMediaMessage } from "@/lib/chat/service";
import { IMAGE_MAX_BYTES, detectImageType } from "@/lib/chat/media";
import { introErrorResponse } from "@/lib/intro/http";

/** The largest multipart body read: a 10 MB photo plus the form's own fields */
const MAX_BODY_BYTES = IMAGE_MAX_BYTES + 512 * 1024;

/**
 * Send a photo or a voice note (Pro), multipart: `file`, `kind` (IMAGE | VOICE), `durationSec` (voice),
 * `clientNonce`, optional `replyToId`. Answers `{ message }` like a text send; the message's `media.url` is the only address
 * of the file a client ever gets.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "حجم الملف أكبر من المسموح", code: "MEDIA_INVALID" }, { status: 413 });

    // A chunked upload has no Content-Length: formData() buffers it before the size checks below, so the real memory cap
    // is Nginx's client_max_body_size (11m, see the deploy notes). The checks here still refuse anything over the limit
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const kind = form?.get("kind");
    const nonce = form?.get("clientNonce");
    const duration = form?.get("durationSec");
    const replyTo = form?.get("replyToId");
    if (!form || !(file instanceof Blob) || (kind !== "IMAGE" && kind !== "VOICE")) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    if ((nonce != null && (typeof nonce !== "string" || nonce.length > 64)) || (replyTo != null && (typeof replyTo !== "string" || replyTo.length > 64))) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    if (file.size > MAX_BODY_BYTES) return NextResponse.json({ error: "حجم الملف أكبر من المسموح", code: "MEDIA_INVALID" }, { status: 413 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const message = await sendMediaMessage({
      conversationId: id,
      senderId: result.session.user.id,
      kind,
      file: bytes,
      // iPhone HEIC often arrives with no type or a wrong one: name and magic bytes decide
      type: kind === "IMAGE" ? detectImageType(file.type, file instanceof File ? file.name : null, bytes) : file.type,
      durationSec: typeof duration === "string" && duration.trim() !== "" ? Number(duration) : undefined,
      clientNonce: typeof nonce === "string" && nonce ? nonce : undefined,
      replyToId: typeof replyTo === "string" && replyTo ? replyTo : undefined,
    });
    return NextResponse.json({ message });
  } catch (error) {
    return introErrorResponse(error, "Send chat media");
  }
}
