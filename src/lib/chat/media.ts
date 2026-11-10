/**
 * Chat photos and voice notes (Pro): limits, checks, image processing and the private storage path.
 *
 * Privacy: the storage path (`chat/<conversationId>/<random>.<ext>`) lives only in `Message.mediaPath`.
 * It is never sent to a client, Ably, a push, analytics or a log. Clients get `mediaUrl()`, the
 * members-only route that streams the file (src/app/api/chats/[id]/media/[messageId]/route.ts).
 */
import { randomBytes } from "crypto";
import path from "path";
import { Worker } from "worker_threads";
import { IntroError } from "@/lib/intro/errors";
import { UNSUPPORTED_IMAGE_MESSAGE } from "@/lib/chat/media-messages";
import { REPLY_IMAGE_LABEL, REPLY_VOICE_LABEL } from "@/lib/chat/reply";

export type MediaKind = "IMAGE" | "VOICE";
export type MessageKindValue = "TEXT" | MediaKind;

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_MAX_SIDE = 1600;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"] as const;
export const VOICE_MAX_BYTES = 6 * 1024 * 1024;
export const VOICE_MIN_SEC = 1;
export const VOICE_MAX_SEC = 185;
export const VOICE_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/aac", "audio/mpeg", "audio/x-m4a"] as const;
/** Pixels sharp may decode: a 48 MP phone photo fits, a decompression bomb doesn't */
const IMAGE_MAX_INPUT_PIXELS = 100_000_000;
/** The wasm HEIC decode is slower and heavier: 50 MP at most, 20 s at most */
const HEIC_MAX_PIXELS = 50_000_000;
const HEIC_TIMEOUT_MS = 20_000;
/** HEIC decodes waiting or running at once: more are refused at once («حاول مرة أخرى»), so a burst can't queue past the proxy timeout */
const HEIC_QUEUE_MAX = 3;

/** `body` of a media message: what app 1.0.x (text only) shows as a normal bubble */
export const IMAGE_FALLBACK_BODY = "📷 صورة — حدّث التطبيق لعرضها";
export const VOICE_FALLBACK_BODY = "🎤 رسالة صوتية — حدّث التطبيق لسماعها";
/** The chat list's last-message preview: the same labels as a reply quote (one source, reply.ts is db-free) */
export const IMAGE_PREVIEW = REPLY_IMAGE_LABEL;
export const VOICE_PREVIEW = REPLY_VOICE_LABEL;

export { UNSUPPORTED_IMAGE_MESSAGE };
export const IMAGE_BUSY_MESSAGE = "تعذّر تجهيز الصورة الآن، يمكنك المحاولة مرة أخرى";

const VOICE_EXT: Record<(typeof VOICE_TYPES)[number], string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/x-m4a": "m4a",
};

/** `audio/webm;codecs=opus` → `audio/webm` (lower case) */
export function baseMime(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

export function fallbackBody(kind: MediaKind): string {
  return kind === "IMAGE" ? IMAGE_FALLBACK_BODY : VOICE_FALLBACK_BODY;
}

/** The chat list preview of a message: the short label for media, the text otherwise */
export function previewBody(m: { body: string; kind?: string | null }): string {
  if (m.kind === "IMAGE") return IMAGE_PREVIEW;
  if (m.kind === "VOICE") return VOICE_PREVIEW;
  return m.body;
}

/** The only address clients ever get for a media message */
export function mediaUrl(conversationId: string, messageId: string): string {
  return `/api/chats/${conversationId}/media/${messageId}`;
}

/** The `media` of a message as clients get it (member chat and admin view alike): its route url, never the path */
export function messageMedia(m: {
  id: string;
  conversationId: string;
  kind?: string | null;
  mediaType?: string | null;
  mediaDurationSec?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
}): { url: string; type: string; durationSec: number | null; width: number | null; height: number | null } | null {
  if (m.kind !== "IMAGE" && m.kind !== "VOICE") return null;
  return {
    url: mediaUrl(m.conversationId, m.id),
    type: m.mediaType ?? "",
    durationSec: m.mediaDurationSec ?? null,
    width: m.mediaWidth ?? null,
    height: m.mediaHeight ?? null,
  };
}

/** A new unguessable storage path: 32 random bytes, base64url (43 characters) */
export function newMediaPath(conversationId: string, ext: string): string {
  return `chat/${conversationId}/${randomBytes(32).toString("base64url")}.${ext}`;
}

export function voiceExtension(type: string): string {
  return VOICE_EXT[baseMime(type) as (typeof VOICE_TYPES)[number]] ?? "bin";
}

type Check = { ok: true } | { ok: false; message: string };

const HEIC_MIMES = ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

/** ISO-BMFF `ftyp` box at byte 4 with a HEIC/HEIF brand */
export function hasHeicMagic(buf: Buffer): boolean {
  return buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp" && HEIC_BRANDS.includes(buf.toString("latin1", 8, 12));
}

/**
 * The image type to validate: a HEIC/HEIF by its MIME, its `.heic`/`.heif` extension or, when the
 * browser/app sent no type (or `application/octet-stream`), its magic bytes, is returned as `image/heic`.
 * Anything else comes back as sent.
 */
export function detectImageType(type: string, fileName: string | null | undefined, buf: Buffer): string {
  const mime = baseMime(type);
  if (HEIC_MIMES.includes(mime)) return "image/heic";
  if (/\.hei[cf]$/i.test(fileName ?? "")) return "image/heic";
  if ((mime === "" || mime === "application/octet-stream") && hasHeicMagic(buf)) return "image/heic";
  return type;
}

export function validateImage(type: string, size: number): Check {
  if (!(IMAGE_TYPES as readonly string[]).includes(baseMime(type))) return { ok: false, message: UNSUPPORTED_IMAGE_MESSAGE };
  if (size <= 0) return { ok: false, message: UNSUPPORTED_IMAGE_MESSAGE };
  if (size > IMAGE_MAX_BYTES) return { ok: false, message: "حجم الصورة أكبر من 10 ميغابايت" };
  return { ok: true };
}

/** The declared duration is trusted within bounds; the size cap limits what a false one can carry */
export function validateVoice(type: string, size: number, durationSec: number): Check {
  if (!(VOICE_TYPES as readonly string[]).includes(baseMime(type))) {
    return { ok: false, message: "صيغة الرسالة الصوتية غير مدعومة" };
  }
  if (size <= 0) return { ok: false, message: "الرسالة الصوتية فارغة" };
  if (size > VOICE_MAX_BYTES) return { ok: false, message: "الرسالة الصوتية أكبر من الحجم المسموح" };
  if (!Number.isFinite(durationSec) || durationSec < VOICE_MIN_SEC) return { ok: false, message: "الرسالة الصوتية قصيرة جداً" };
  if (durationSec > VOICE_MAX_SEC) return { ok: false, message: "الحد الأقصى للرسالة الصوتية 3 دقائق" };
  return { ok: true };
}

let heicQueue: Promise<unknown> = Promise.resolve();
let heicPending = 0;

/** The HEIC queue is full: refused at once, never queued */
export class MediaBusyError extends Error {}

/**
 * One decode at a time: each waits for the one before it, so there is never more than one worker. At most
 * HEIC_QUEUE_MAX waiting or running; the time limit runs from the decode's own start. `timeoutMs` and `script` are
 * for tests.
 */
export function runHeicWorker(buf: Buffer, opts: { timeoutMs?: number; script?: string } = {}): Promise<Buffer> {
  if (heicPending >= HEIC_QUEUE_MAX) return Promise.reject(new MediaBusyError("heic queue full"));
  heicPending += 1;
  const timeoutMs = opts.timeoutMs ?? HEIC_TIMEOUT_MS;
  // A plain .mjs outside the bundle, found from the app root (the slot's directory in production)
  const script = opts.script ?? path.join(process.cwd(), "src/lib/chat/heic-worker.mjs");
  const job = heicQueue.then(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        const worker = new Worker(script, {
          workerData: { buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) },
        });
        const timer = setTimeout(() => {
          void worker.terminate();
          reject(new Error("heic decode timed out"));
        }, timeoutMs);
        const done = () => clearTimeout(timer);
        worker.once("message", (m: { ok: boolean; buffer?: ArrayBuffer; message?: string }) => {
          done();
          void worker.terminate();
          if (m.ok && m.buffer) resolve(Buffer.from(m.buffer));
          else reject(new Error(m.message ?? "heic decode failed"));
        });
        worker.once("error", (e) => {
          done();
          reject(e);
        });
        worker.once("exit", (code) => {
          done();
          reject(new Error(`heic worker exited ${code}`));
        });
      })
  );
  const settled = job.finally(() => {
    heicPending -= 1;
  });
  heicQueue = settled.catch(() => undefined);
  return settled;
}

/** sharp first; when this libvips has no HEVC decoder, the wasm decoder (in a worker) turns HEIC into a JPEG for it */
async function decodeHeicToJpeg(buf: Buffer, sharp: typeof import("sharp")): Promise<Buffer> {
  // Size check before the decode: the decoder has no pixel limit of its own
  const { width = 0, height = 0 } = await sharp(buf).metadata();
  if (width * height > HEIC_MAX_PIXELS) throw new Error("too large");
  return runHeicWorker(buf);
}

/**
 * Re-encode a photo to WebP, long side ≤ 1600 px, turned upright from its EXIF orientation. No
 * `withMetadata()`, so EXIF (GPS location included), ICC and XMP are all dropped. A photo sharp can't
 * decode is refused. HEIC/HEIF (iPhone) goes through sharp when it can decode it, else through the
 * wasm decoder (primary image only), and then the same pipeline.
 */
export async function processImage(buf: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  try {
    // Loaded here so the constants above stay importable without the native module
    const { default: sharp } = await import("sharp");
    const run = (input: Buffer) =>
      sharp(input, { limitInputPixels: IMAGE_MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: IMAGE_MAX_SIDE, height: IMAGE_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    let out;
    try {
      out = await run(buf);
    } catch (err) {
      if (!hasHeicMagic(buf)) throw err;
      out = await run(await decodeHeicToJpeg(buf, sharp));
    }
    return { buffer: out.data, width: out.info.width, height: out.info.height };
  } catch (e) {
    throw new IntroError("MEDIA_INVALID", e instanceof MediaBusyError ? IMAGE_BUSY_MESSAGE : UNSUPPORTED_IMAGE_MESSAGE);
  }
}

export interface ParsedRange {
  start: number;
  end: number;
}

/**
 * One `Range: bytes=a-b` / `bytes=a-` / `bytes=-n`. null: no usable range (serve the whole file);
 * "unsatisfiable": answer 416. Multiple ranges are not supported (served whole, which is allowed).
 */
export function parseRange(header: string | null, size: number): ParsedRange | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (n === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}
