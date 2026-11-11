import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { NextResponse } from "next/server";

const db = vi.hoisted(() => ({
  // Chat delete (task 3): my clear and my hides, none here
  conversationClear: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []) },
  messageHide: { findMany: vi.fn(async () => []) },
  conversation: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  block: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  report: { findMany: vi.fn(), updateMany: vi.fn() },
  user: { findMany: vi.fn() },
  introRequest: { updateMany: vi.fn(), findFirst: vi.fn() },
  visitRequest: { findUnique: vi.fn() },
}));
const ably = vi.hoisted(() => ({ publishChatEvent: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
const rl = vi.hoisted(() => ({ rateLimit: vi.fn() }));
const reports = vi.hoisted(() => ({ fileReport: vi.fn() }));
const pro = vi.hoisted(() => ({ isPro: vi.fn(), proUserIds: vi.fn() }));
const bunny = vi.hoisted(() => ({ uploadToBunny: vi.fn(), deleteFromBunny: vi.fn(), readFromBunny: vi.fn() }));
const auth = vi.hoisted(() => ({ requireUser: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ably", () => ably);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/chat/bell", () => ({ upsertChatBell: vi.fn(), clearChatBell: vi.fn() }));
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/rate-limit", () => rl);
vi.mock("@/lib/reports", () => reports);
vi.mock("@/lib/pro/status", () => pro);
vi.mock("@/lib/bunny", () => bunny);
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/admin-alert", () => ({ sendAdminAlert: vi.fn() }));

import { getConversation, listConversations, sendMediaMessage, sendMessage } from "@/lib/chat/service";
import { IMAGE_BUSY_MESSAGE, IMAGE_FALLBACK_BODY, VOICE_FALLBACK_BODY, MediaBusyError, detectImageType, hasHeicMagic, processImage, runHeicWorker, validateImage, validateVoice } from "@/lib/chat/media";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { join } from "path";
import { IntroError } from "@/lib/intro/errors";
import { GET as getMedia } from "@/app/api/chats/[id]/media/[messageId]/route";
import { clearMediaCache, readMediaCached, MEDIA_CACHE_TTL_MS, MEDIA_CACHE_MAX_BYTES } from "@/lib/chat/media-cache";

const DAY = 24 * 60 * 60 * 1000;
const conv = (over: object = {}) => ({
  id: "c1",
  matchId: "m1",
  status: "ACTIVE",
  expiresAt: new Date(Date.now() + 10 * DAY),
  createdAt: new Date(Date.now() - 4 * DAY),
  extended: false,
  expiryWarnedAt: null,
  familyNudgeAt: null,
  endedById: null,
  match: {
    id: "m1", femaleId: "f1", maleId: "u1",
    female: { id: "f1", firstName: "هديل", isVerified: true },
    male: { id: "u1", firstName: "يزن", isVerified: true },
  },
  ...over,
});

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(IntroError);
  expect((err as IntroError).code).toBe(code);
}

async function gpsJpeg(width = 2400, height = 1200): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 34, g: 71, b: 106 } } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "31/1 57/1 0/1" } })
    .toBuffer();
}

const PATH_RE = /^chat\/c1\/[A-Za-z0-9_-]{43}\.webp$/;

beforeEach(() => {
  vi.clearAllMocks();
  settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true });
  rl.rateLimit.mockReturnValue({ success: true, remaining: 1, resetAt: 0 });
  pro.isPro.mockResolvedValue(true);
  pro.proUserIds.mockResolvedValue(new Set());
  db.conversation.findUnique.mockResolvedValue(conv());
  db.block.findFirst.mockResolvedValue(null);
  db.block.findMany.mockResolvedValue([]);
  db.message.findFirst.mockResolvedValue(null);
  db.message.findMany.mockResolvedValue([]);
  db.message.count.mockResolvedValue(0);
  db.message.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "msg1", ...data, createdAt: new Date(), readAt: null,
  }));
  bunny.uploadToBunny.mockImplementation(async (_b: Buffer, path: string) => `https://cdn.example/${path}`);
  bunny.deleteFromBunny.mockResolvedValue(undefined);
});

describe("sendMediaMessage: checks before any upload", () => {
  it("refuses a non-Pro sender with PRO_REQUIRED and uploads nothing", async () => {
    pro.isPro.mockResolvedValue(false);
    await expectCode(
      sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "IMAGE", file: await gpsJpeg(), type: "image/jpeg" }),
      "PRO_REQUIRED"
    );
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("refuses an ENDED chat with NOT_ALLOWED and uploads nothing", async () => {
    db.conversation.findUnique.mockResolvedValue(conv({ status: "ENDED" }));
    await expectCode(
      sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "VOICE", file: Buffer.alloc(100), type: "audio/mp4", durationSec: 10 }),
      "NOT_ALLOWED"
    );
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
  });

  it("refuses across a block and uploads nothing", async () => {
    db.block.findFirst.mockImplementation(async ({ where }: { where: { OR?: unknown } }) => (where.OR ? { id: "b" } : null));
    await expectCode(
      sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "IMAGE", file: await gpsJpeg(), type: "image/jpeg" }),
      "BLOCKED"
    );
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
  });

  it("refuses when the chat switch is off", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: false });
    await expectCode(
      sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "VOICE", file: Buffer.alloc(100), type: "audio/mp4", durationSec: 10 }),
      "DISABLED"
    );
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
  });

  it("applies the chat-burst rate limit before uploading", async () => {
    rl.rateLimit.mockReturnValue({ success: false, remaining: 0, resetAt: 0 });
    await expectCode(
      sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "VOICE", file: Buffer.alloc(100), type: "audio/mp4", durationSec: 10 }),
      "RATE_LIMITED"
    );
    expect(rl.rateLimit).toHaveBeenCalledWith("chat-burst:u1", expect.anything());
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
  });

  it("refuses an undecodable photo with a clear message and uploads nothing", async () => {
    const err = await sendMediaMessage({
      conversationId: "c1", senderId: "u1", kind: "IMAGE", file: Buffer.from("not an image"), type: "image/heic",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(IntroError);
    expect(err.message).toBe("صيغة الصورة غير مدعومة، يمكنك تجربة صورة JPG أو PNG");
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
  });

  it("refuses a photo over 10 MB", async () => {
    await expectCode(
      sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "IMAGE", file: Buffer.alloc(10 * 1024 * 1024 + 1), type: "image/jpeg" }),
      "MEDIA_INVALID"
    );
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
  });
});

describe("sendMediaMessage: a photo", () => {
  it("stores a metadata-free WebP at a private random path and returns only the media route", async () => {
    const msg = await sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "IMAGE", file: await gpsJpeg(), type: "image/jpeg" });
    expect(bunny.uploadToBunny).toHaveBeenCalledTimes(1);
    const [buf, path, mime] = bunny.uploadToBunny.mock.calls[0];
    expect(path).toMatch(PATH_RE);
    expect(mime).toBe("image/webp");
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1600);

    const data = db.message.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ kind: "IMAGE", mediaPath: path, mediaType: "image/webp", mediaWidth: 1600, mediaHeight: 800, body: IMAGE_FALLBACK_BODY });

    expect(msg.kind).toBe("IMAGE");
    expect(msg.body).toBe(IMAGE_FALLBACK_BODY);
    expect(msg.media).toEqual({ url: "/api/chats/c1/media/msg1", type: "image/webp", durationSec: null, width: 1600, height: 800 });
    expect(JSON.stringify(msg)).not.toContain("chat/");
  });

  it("never puts the storage path in the Ably event or the push", async () => {
    // Its own chat, so the push throttle of the other tests doesn't hold this push back
    db.conversation.findUnique.mockResolvedValue(conv({ id: "c9" }));
    await sendMediaMessage({ conversationId: "c9", senderId: "u1", kind: "IMAGE", file: await gpsJpeg(), type: "image/jpeg" });
    const path = bunny.uploadToBunny.mock.calls[0][1] as string;
    const event = ably.publishChatEvent.mock.calls.find((c) => c[1] === "message")![2];
    expect(event).toMatchObject({ kind: "IMAGE", body: IMAGE_FALLBACK_BODY, media: { url: "/api/chats/c9/media/msg1" } });
    expect(JSON.stringify(event)).not.toContain(path);
    expect(JSON.stringify(event)).not.toContain("chat/");
    const pushed = notifyMod.notify.mock.calls[0][0];
    expect(pushed.body).toBe("رسالة جديدة من يزن");
    expect(JSON.stringify(pushed)).not.toContain("chat/");
  });

  it("deletes the uploaded file when the row can't be saved", async () => {
    db.message.create.mockRejectedValue(new Error("db down"));
    await expect(
      sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "IMAGE", file: await gpsJpeg(), type: "image/jpeg" })
    ).rejects.toThrow();
    const path = bunny.uploadToBunny.mock.calls[0][1];
    expect(bunny.deleteFromBunny).toHaveBeenCalledWith(path);
  });

  it("a failed save never lets the storage path reach a log: the Prisma error is replaced", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    // Prisma's validation errors quote the data they were given, mediaPath included
    db.message.create.mockImplementation(async ({ data }: { data: { mediaPath: string } }) => {
      throw Object.assign(new Error(`Invalid \`db.message.create()\` invocation: { mediaPath: "${data.mediaPath}" }`), { code: "P2000" });
    });
    const thrown = await sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "IMAGE", file: await gpsJpeg(), type: "image/jpeg" }).catch((e) => e);
    const path = bunny.uploadToBunny.mock.calls[0][1] as string;
    expect((thrown as Error).message).toBe("chat media save failed");
    expect(String((thrown as Error).message)).not.toContain(path);
    expect(JSON.stringify(err.mock.calls)).not.toContain(path);
    expect(JSON.stringify(err.mock.calls)).toContain("P2000");
    err.mockRestore();
  });

  it("a retry with the same nonce gets the saved message back, without a second upload", async () => {
    db.message.findFirst.mockResolvedValue({
      id: "saved", conversationId: "c1", senderId: "u1", body: IMAGE_FALLBACK_BODY, kind: "IMAGE",
      mediaPath: "chat/c1/x.webp", mediaType: "image/webp", mediaWidth: 10, mediaHeight: 10, mediaDurationSec: null,
      createdAt: new Date(), readAt: null,
    });
    const msg = await sendMediaMessage({
      conversationId: "c1", senderId: "u1", kind: "IMAGE", file: await gpsJpeg(), type: "image/jpeg", clientNonce: "n1",
    });
    expect(msg.id).toBe("saved");
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
  });
});

describe("sendMediaMessage: a voice note", () => {
  it("a WebM (Chrome, Android) note is transcoded to AAC in an .m4a and stored as audio/mp4, keeping the declared duration", async () => {
    const webm = execFileSync(ffmpegPath as unknown as string, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=d=2", "-c:a", "libopus", "-f", "webm", "pipe:1"]);
    const msg = await sendMediaMessage({
      conversationId: "c1", senderId: "u1", kind: "VOICE", file: webm, type: "audio/webm;codecs=opus", durationSec: 42,
    });
    const [buf, path, mime] = bunny.uploadToBunny.mock.calls[0];
    expect(path).toMatch(/^chat\/c1\/[A-Za-z0-9_-]{43}\.m4a$/);
    expect(mime).toBe("audio/mp4");
    expect((buf as Buffer).toString("latin1", 4, 8)).toBe("ftyp");
    expect(db.message.create.mock.calls[0][0].data).toMatchObject({ kind: "VOICE", mediaType: "audio/mp4", mediaDurationSec: 42, body: VOICE_FALLBACK_BODY });
    expect(msg.media).toMatchObject({ type: "audio/mp4", durationSec: 42, width: null, height: null });
  });

  it("an MP4 note is transcoded too (Chrome may put Opus in MP4): a fresh AAC .m4a, never the bytes as sent", async () => {
    const file = execFileSync(ffmpegPath as unknown as string, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=d=2", "-c:a", "aac", "-f", "mp4", "-movflags", "frag_keyframe+empty_moov", "pipe:1"]);
    await sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "VOICE", file, type: "audio/mp4;codecs=mp4a.40.2", durationSec: 12 });
    const [buf, path, mime] = bunny.uploadToBunny.mock.calls[0];
    expect(buf).not.toBe(file);
    expect((buf as Buffer).toString("latin1", 4, 8)).toBe("ftyp");
    expect(path).toMatch(/\.m4a$/);
    expect(mime).toBe("audio/mp4");
  });

  it("an MP4 that isn't audio: the Arabic 422 error, nothing uploaded", async () => {
    await expectCode(
      sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "VOICE", file: Buffer.alloc(2000), type: "audio/mp4", durationSec: 5 }),
      "MEDIA_INVALID"
    );
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
  });

  it("a voice note ffmpeg can't read: the Arabic 422 error, nothing uploaded", async () => {
    await expectCode(
      sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "VOICE", file: Buffer.alloc(2000), type: "audio/webm", durationSec: 5 }),
      "MEDIA_INVALID"
    );
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
  });

  it("a non-Pro sender never reaches the transcoder", async () => {
    pro.isPro.mockResolvedValue(false);
    await expectCode(
      sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "VOICE", file: Buffer.alloc(2000), type: "audio/webm", durationSec: 5 }),
      "PRO_REQUIRED"
    );
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
  });

  it("refuses a 200 s voice note before uploading", async () => {
    await expectCode(
      sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "VOICE", file: Buffer.alloc(2000), type: "audio/mp4", durationSec: 200 }),
      "MEDIA_INVALID"
    );
    expect(bunny.uploadToBunny).not.toHaveBeenCalled();
  });
});

describe("validateVoice", () => {
  it("accepts audio/mp4 for 120 s", () => {
    expect(validateVoice("audio/mp4", 1_000_000, 120)).toEqual({ ok: true });
  });
  it("refuses 200 s", () => {
    expect(validateVoice("audio/mp4", 1_000_000, 200).ok).toBe(false);
  });
  it("refuses video/mp4", () => {
    expect(validateVoice("video/mp4", 1_000, 10).ok).toBe(false);
  });
  it("refuses over 6 MB, zero seconds and a missing duration", () => {
    expect(validateVoice("audio/aac", 6 * 1024 * 1024 + 1, 10).ok).toBe(false);
    expect(validateVoice("audio/aac", 1000, 0).ok).toBe(false);
    expect(validateVoice("audio/aac", 1000, Number.NaN).ok).toBe(false);
  });
  it("accepts codec parameters and upper case", () => {
    expect(validateVoice("Audio/Ogg; codecs=opus", 1000, 5)).toEqual({ ok: true });
  });
});

describe("processImage", () => {
  it("strips EXIF/GPS and caps the long side at 1600", async () => {
    const input = await gpsJpeg(1200, 3000);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await processImage(input);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(out.height).toBe(1600);
    expect(out.width).toBe(640);
  });
  it("never enlarges a small photo", async () => {
    const out = await processImage(await gpsJpeg(300, 200));
    expect([out.width, out.height]).toEqual([300, 200]);
  });
});

describe("HEIC / HEIF (iPhone)", () => {
  const heic = () => readFileSync(join(__dirname, "../fixtures/small.heic"));

  it("detects HEIC by MIME, by extension, and by magic when the type is empty or octet-stream", () => {
    const junk = Buffer.from("not an image at all");
    for (const t of ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]) {
      expect(detectImageType(t, null, junk)).toBe("image/heic");
    }
    expect(detectImageType("", "IMG_1.HEIC", junk)).toBe("image/heic");
    expect(detectImageType("application/octet-stream", "x.heif", junk)).toBe("image/heic");
    expect(detectImageType("", "photo", heic())).toBe("image/heic");
    expect(detectImageType("application/octet-stream", "photo", heic())).toBe("image/heic");
    expect(detectImageType("image/jpeg", "a.jpg", junk)).toBe("image/jpeg");
    expect(detectImageType("", "a", junk)).toBe("");
  });

  it("accepts every HEIC/HEIF MIME through validateImage and the full intake", async () => {
    for (const t of ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]) {
      expect(validateImage(t, 1000).ok).toBe(true);
      expect(validateImage(detectImageType(t, null, heic()), 1000).ok).toBe(true);
    }
    for (const t of ["image/heic-sequence", "image/heif-sequence"]) {
      await sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "IMAGE", file: heic(), type: t });
      expect(bunny.uploadToBunny.mock.calls.at(-1)![2]).toBe("image/webp");
    }
  });

  it("decodes one at a time through the worker and survives several at once", async () => {
    const outs = await Promise.all([processImage(heic()), processImage(heic()), processImage(heic())]);
    for (const o of outs) expect(o.width).toBe(1600);
  });

  it("recognises every ISO-BMFF HEIC brand", () => {
    for (const brand of ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]) {
      expect(hasHeicMagic(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp" + brand)]))).toBe(true);
    }
    expect(hasHeicMagic(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom")]))).toBe(false);
  });

  it("decodes a real HEIC to a metadata-free WebP, long side ≤ 1600", async () => {
    const out = await processImage(heic());
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1600);
    expect(out.width).toBe(1600);
    expect(out.height).toBe(720);
  });

  it("sends an octet-stream HEIC through the whole send path", async () => {
    const buf = heic();
    const type = detectImageType("application/octet-stream", "photo", buf);
    await sendMediaMessage({ conversationId: "c1", senderId: "u1", kind: "IMAGE", file: buf, type });
    expect(bunny.uploadToBunny.mock.calls[0][2]).toBe("image/webp");
  });

  it("refuses a corrupt HEIC with the Arabic message", async () => {
    const corrupt = Buffer.concat([heic().subarray(0, 40), Buffer.alloc(200, 7)]);
    const err = await processImage(corrupt).catch((e) => e);
    expect(err).toBeInstanceOf(IntroError);
    expect(err.message).toBe("صيغة الصورة غير مدعومة، يمكنك تجربة صورة JPG أو PNG");
  });
});

describe("text messages keep their behaviour", () => {
  it("the filter still runs on text", async () => {
    await expectCode(sendMessage({ conversationId: "c1", senderId: "u1", body: "رقمي 0791234567" }), "FILTERED");
    expect(db.message.create).not.toHaveBeenCalled();
  });
  it("a text message comes back with kind TEXT and no media", async () => {
    const msg = await sendMessage({ conversationId: "c1", senderId: "u1", body: "مرحبا" });
    expect(msg).toMatchObject({ kind: "TEXT", media: null, body: "مرحبا" });
  });
});

describe("reading chats with media", () => {
  it("the chat list previews a photo with the short text", async () => {
    db.conversation.findMany.mockResolvedValue([
      { ...conv(), messages: [{ body: IMAGE_FALLBACK_BODY, kind: "IMAGE", createdAt: new Date(), senderId: "f1", readAt: null }], _count: { messages: 1 } },
    ]);
    const [s] = await listConversations("u1");
    expect(s.lastMessage?.body).toBe("📷 صورة");
  });

  it("the chat list marks a Pro partner for the badge, with one lookup", async () => {
    pro.proUserIds.mockResolvedValue(new Set(["f1"]));
    db.conversation.findMany.mockResolvedValue([{ ...conv(), messages: [], _count: { messages: 0 } }]);
    const [s] = await listConversations("u1");
    expect(s.partner.isPro).toBe(true);
    expect(pro.proUserIds).toHaveBeenCalledTimes(1);
  });

  it("the chat room marks a Pro partner (looked up with the other reads; a failed lookup just hides the badge)", async () => {
    db.message.findMany.mockResolvedValue([]);
    pro.isPro.mockImplementation(async (id: string) => id === "f1");
    expect((await getConversation("c1", "u1")).conversation.partner.isPro).toBe(true);
    expect(pro.isPro).toHaveBeenCalledWith("f1");
    pro.isPro.mockRejectedValue(new Error("db down"));
    expect((await getConversation("c1", "u1")).conversation.partner.isPro).toBe(false);
  });

  it("messages carry kind + the media route, never the stored path", async () => {
    db.message.findMany.mockResolvedValue([
      {
        id: "v1", conversationId: "c1", senderId: "f1", body: VOICE_FALLBACK_BODY, kind: "VOICE",
        mediaPath: "chat/c1/secret.m4a", mediaType: "audio/mp4", mediaDurationSec: 30, mediaWidth: null, mediaHeight: null,
        createdAt: new Date(), readAt: null,
      },
    ]);
    const { messages, conversation } = await getConversation("c1", "u1");
    expect(messages[0]).toMatchObject({ kind: "VOICE", body: VOICE_FALLBACK_BODY, media: { url: "/api/chats/c1/media/v1", durationSec: 30 } });
    expect(conversation.lastMessage?.body).toBe("🎤 رسالة صوتية");
    expect(JSON.stringify({ messages, conversation })).not.toContain("secret");
  });
});

describe("GET /api/chats/[id]/media/[messageId]", () => {
  const AUDIO = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
  const row = (over: object = {}) => ({
    id: "v1", conversationId: "c1", kind: "VOICE", mediaPath: "chat/c1/secret.m4a", mediaType: "audio/mp4",
    conversation: { match: { femaleId: "f1", maleId: "u1" } },
    ...over,
  });
  const call = (headers: Record<string, string> = {}, id = "c1", messageId = "v1") =>
    getMedia(new Request("http://x/api/chats/c1/media/v1", { headers }), { params: Promise.resolve({ id, messageId }) }) as Promise<Response>;
  const signedIn = (id: string) => auth.requireUser.mockResolvedValue({ session: { user: { id } } });
  const forbidden = () => ({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });

  beforeEach(() => {
    clearMediaCache();
    db.message.findUnique.mockResolvedValue(row());
    bunny.readFromBunny.mockResolvedValue(AUDIO);
    auth.requireAdmin.mockResolvedValue(forbidden());
  });

  it("serves the whole file to a member with private caching", async () => {
    signedIn("u1");
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mp4");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(Buffer.from(await res.arrayBuffer()).equals(AUDIO)).toBe(true);
    expect(bunny.readFromBunny).toHaveBeenCalledWith("chat/c1/secret.m4a");
  });

  it("404s for a stranger and never reads the file", async () => {
    signedIn("stranger");
    expect((await call()).status).toBe(404);
    expect(bunny.readFromBunny).not.toHaveBeenCalled();
  });

  it("401s when nobody is signed in (the app signs in again), before anything is looked up", async () => {
    auth.requireUser.mockResolvedValue({ error: NextResponse.json({ error: "غير مصرح" }, { status: 401 }) });
    expect((await call()).status).toBe(401);
    expect(db.message.findUnique).not.toHaveBeenCalled();
  });

  it("several Range requests of one note read the file from storage once", async () => {
    signedIn("u1");
    await call({ Range: "bytes=0-1" });
    await call({ Range: "bytes=0-999" });
    await call();
    expect(bunny.readFromBunny).toHaveBeenCalledTimes(1);
  });

  it("404s for a text message, and for a message of another chat", async () => {
    signedIn("u1");
    db.message.findUnique.mockResolvedValue(row({ kind: "TEXT", mediaPath: null }));
    expect((await call()).status).toBe(404);
    db.message.findUnique.mockResolvedValue(row({ conversationId: "other" }));
    expect((await call()).status).toBe(404);
    expect(bunny.readFromBunny).not.toHaveBeenCalled();
  });

  it("answers Range: bytes=0-99 with 206 and the first 100 bytes", async () => {
    signedIn("f1");
    const res = await call({ Range: "bytes=0-99" });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-99/1000");
    expect(res.headers.get("Content-Length")).toBe("100");
    expect(Buffer.from(await res.arrayBuffer()).equals(AUDIO.subarray(0, 100))).toBe(true);
  });

  it("answers an open range and refuses an unsatisfiable one", async () => {
    signedIn("f1");
    const open = await call({ Range: "bytes=900-" });
    expect(open.status).toBe(206);
    expect(open.headers.get("Content-Range")).toBe("bytes 900-999/1000");
    const bad = await call({ Range: "bytes=5000-6000" });
    expect(bad.status).toBe(416);
    expect(bad.headers.get("Content-Range")).toBe("bytes */1000");
  });

  it("lets an admin web session in and logs the view", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    signedIn("admin1");
    auth.requireAdmin.mockResolvedValue({ session: { user: { id: "admin1", role: "ADMIN" } } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[admin-chat-view] admin=admin1 chat=c1 media=v1"));
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });

  it("404s when the file can't be read, without logging the path", async () => {
    signedIn("u1");
    bunny.readFromBunny.mockResolvedValue(null);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call()).status).toBe(404);
    expect(JSON.stringify(err.mock.calls)).not.toContain("secret");
  });
});

describe("report evidence keeps media references", () => {
  it("transcript entries carry kind and mediaPath", async () => {
    const { snapshotReportEvidence } = await vi.importActual<typeof import("@/lib/reports")>("@/lib/reports");
    db.report.findMany.mockResolvedValue([{ id: "r1", reporterId: "f1", reportedId: "u1", conversationId: "c1" }]);
    db.user.findMany.mockResolvedValue([]);
    db.conversation.findUnique.mockResolvedValue({ id: "c1" });
    db.message.findMany.mockResolvedValue([
      { senderId: "u1", body: IMAGE_FALLBACK_BODY, kind: "IMAGE", mediaPath: "chat/c1/p.webp", createdAt: new Date() },
      { senderId: "f1", body: "مرحبا", kind: "TEXT", mediaPath: null, createdAt: new Date(Date.now() - 1000) },
    ]);
    db.report.updateMany.mockResolvedValue({ count: 1 });
    await snapshotReportEvidence("u1");
    const saved = db.report.updateMany.mock.calls[0][0].data.evidence.chat.messages;
    expect(saved).toEqual([
      // A text entry keeps its earlier shape
      { at: expect.any(String), from: "reporter", body: "مرحبا" },
      expect.objectContaining({ from: "reported", kind: "IMAGE", mediaPath: "chat/c1/p.webp" }),
    ]);
  });

  it("the admin page gets the evidence without the storage path", async () => {
    const { evidenceForAdmin } = await vi.importActual<typeof import("@/lib/reports")>("@/lib/reports");
    const evidence = {
      capturedAt: "2026-11-09T00:00:00.000Z",
      people: { reporter: null, reported: null },
      chat: {
        id: "c1", truncated: false,
        messages: [
          { at: "x", from: "reported", body: IMAGE_FALLBACK_BODY, kind: "IMAGE", mediaPath: "chat/c1/p.webp" },
          { at: "y", from: "reporter", body: "مرحبا" },
        ],
      },
    };
    const out = evidenceForAdmin(evidence) as typeof evidence;
    expect(JSON.stringify(out)).not.toContain("chat/c1/p.webp");
    expect(out.chat.messages[0]).toMatchObject({ kind: "IMAGE", hasMedia: true });
    expect(out.chat.messages[1]).toMatchObject({ body: "مرحبا", hasMedia: false });
    expect(evidenceForAdmin(null)).toBeNull();
    expect(evidenceForAdmin({ capturedAt: "x", people: {}, chat: null })).toEqual({ capturedAt: "x", people: {}, chat: null });
  });
});

describe("HEIC worker: time limit and queue cap", () => {
  const hanging = () => {
    const dir = mkdtempSync(join(tmpdir(), "heic-worker-test-"));
    const script = join(dir, "hang.mjs");
    // A decoder that never answers
    writeFileSync(script, "setInterval(() => {}, 1000);\n");
    return script;
  };

  it("a decode that never finishes is stopped after the time limit", async () => {
    const started = Date.now();
    const e = await runHeicWorker(Buffer.from("x"), { timeoutMs: 100, script: hanging() }).then(() => null, (err) => err);
    expect((e as Error).message).toBe("heic decode timed out");
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("a full queue is refused at once, and the queue frees up afterwards", async () => {
    const script = hanging();
    const waiting = [1, 2, 3].map(() => runHeicWorker(Buffer.from("x"), { timeoutMs: 100, script }).catch((e) => e));
    await expect(runHeicWorker(Buffer.from("x"), { timeoutMs: 100, script })).rejects.toBeInstanceOf(MediaBusyError);
    await Promise.all(waiting);
    const again = await runHeicWorker(Buffer.from("x"), { timeoutMs: 100, script }).then(() => null, (err) => err);
    expect((again as Error).message).toBe("heic decode timed out");
  });

  it("a photo refused because the queue is full says «حاول مرة أخرى», not «unsupported»", async () => {
    const script = hanging();
    const waiting = [1, 2, 3].map(() => runHeicWorker(Buffer.from("x"), { timeoutMs: 300, script }).catch((e) => e));
    const err = await processImage(readFileSync(join(__dirname, "../fixtures/small.heic"))).catch((e) => e);
    expect(err).toBeInstanceOf(IntroError);
    expect(err.message).toBe(IMAGE_BUSY_MESSAGE);
    await Promise.all(waiting);
  });
});

describe("media cache", () => {
  beforeEach(() => clearMediaCache());

  it("serves a fresh entry from memory, reads again after the TTL, and never caches a miss", async () => {
    const read = vi.fn(async () => Buffer.from("abc"));
    await readMediaCached("m1", read, 0);
    await readMediaCached("m1", read, MEDIA_CACHE_TTL_MS - 1);
    expect(read).toHaveBeenCalledTimes(1);
    await readMediaCached("m1", read, MEDIA_CACHE_TTL_MS + 1);
    expect(read).toHaveBeenCalledTimes(2);
    const missing = vi.fn(async () => null);
    await readMediaCached("m2", missing, 0);
    await readMediaCached("m2", missing, 1);
    expect(missing).toHaveBeenCalledTimes(2);
  });

  it("keeps at most MEDIA_CACHE_MAX_BYTES, dropping the least recently used", async () => {
    const big = (n: number) => vi.fn(async () => Buffer.alloc(n));
    const half = Math.floor(MEDIA_CACHE_MAX_BYTES / 2);
    const a = big(half);
    const b = big(half);
    const c = big(half);
    await readMediaCached("a", a, 0);
    await readMediaCached("b", b, 1);
    await readMediaCached("a", a, 2); // a is now the most recent
    await readMediaCached("c", c, 3); // b goes
    await readMediaCached("a", a, 4);
    await readMediaCached("b", b, 5);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("parallel requests for one file share one read (a player's two Range requests)", async () => {
    let finish!: (b: Buffer) => void;
    const read = vi.fn(() => new Promise<Buffer | null>((r) => (finish = r)));
    const both = Promise.all([readMediaCached("m1", read, 0), readMediaCached("m1", read, 0)]);
    finish(Buffer.from("abc"));
    const [x, y] = await both;
    expect(read).toHaveBeenCalledTimes(1);
    expect(x?.toString()).toBe("abc");
    expect(y?.toString()).toBe("abc");
    // Cached afterwards as usual
    await readMediaCached("m1", read, 1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("a failed or missing shared read is not kept: the next request reads again", async () => {
    const failing = vi.fn(async () => {
      throw new Error("bunny down");
    });
    await expect(Promise.all([readMediaCached("m1", failing, 0), readMediaCached("m1", failing, 0)])).rejects.toThrow("bunny down");
    expect(failing).toHaveBeenCalledTimes(1);
    const ok = vi.fn(async () => Buffer.from("ok"));
    expect((await readMediaCached("m1", ok, 1))?.toString()).toBe("ok");
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
