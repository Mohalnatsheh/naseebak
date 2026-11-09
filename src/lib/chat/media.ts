/**
 * Chat photos and voice notes (Pro): limits, checks, image processing and the private storage path.
 *
 * Privacy: the storage path (`chat/<conversationId>/<random>.<ext>`) lives only in `Message.mediaPath`.
 * It is never sent to a client, Ably, a push, analytics or a log. Clients get `mediaUrl()`, the
 * members-only route that streams the file (src/app/api/chats/[id]/media/[messageId]/route.ts).
 */
import { randomBytes } from "crypto";
import { IntroError } from "@/lib/intro/errors";

export type MediaKind = "IMAGE" | "VOICE";
export type MessageKindValue = "TEXT" | MediaKind;

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_MAX_SIDE = 1600;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const VOICE_MAX_BYTES = 6 * 1024 * 1024;
export const VOICE_MIN_SEC = 1;
export const VOICE_MAX_SEC = 185;
export const VOICE_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/aac", "audio/mpeg", "audio/x-m4a"] as const;
/** Pixels sharp may decode: a 48 MP phone photo fits, a decompression bomb doesn't */
const IMAGE_MAX_INPUT_PIXELS = 100_000_000;

/** `body` of a media message: what app 1.0.x (text only) shows as a normal bubble */
export const IMAGE_FALLBACK_BODY = "📷 صورة — حدّث التطبيق لعرضها";
export const VOICE_FALLBACK_BODY = "🎤 رسالة صوتية — حدّث التطبيق لسماعها";
/** The chat list's last-message preview */
export const IMAGE_PREVIEW = "📷 صورة";
export const VOICE_PREVIEW = "🎤 رسالة صوتية";

export const UNSUPPORTED_IMAGE_MESSAGE = "صيغة الصورة غير مدعومة، جرّب صورة JPG أو PNG";

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
  if (HEIC_MIMES.includes(mime)) return mime;
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

/** sharp first; when this libvips has no HEVC decoder, the wasm decoder turns HEIC into a JPEG for it */
async function decodeHeicToJpeg(buf: Buffer, sharp: typeof import("sharp")): Promise<Buffer> {
  // Size check before the decode: heic-convert has no pixel limit of its own
  const { width = 0, height = 0 } = await sharp(buf).metadata();
  if (width * height > IMAGE_MAX_INPUT_PIXELS) throw new Error("too large");
  // Loaded only when a HEIC arrives, so it stays out of every other path and every client bundle
  const { default: convert } = await import("heic-convert");
  return Buffer.from(await convert({ buffer: buf, format: "JPEG", quality: 0.9 }));
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
  } catch {
    throw new IntroError("MEDIA_INVALID", UNSUPPORTED_IMAGE_MESSAGE);
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
