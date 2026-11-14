import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

const db = vi.hoisted(() => ({
  photo: { findMany: vi.fn(), update: vi.fn() },
}));
const bunny = vi.hoisted(() => ({
  getBunnyPathFromUrl: vi.fn((url: string) => (url.startsWith("cdn://") ? url.slice(6) : null)),
  readFromBunny: vi.fn(),
  base64ToBuffer: (dataUrl: string) => {
    const m = dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
    return m ? { buffer: Buffer.from(m[3], "base64"), extension: "jpg", mimeType: m[1] } : null;
  },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/bunny", () => bunny);

import { makeBlurPreview, primaryPhotoPreview, readPhotoBytes, refreshMemberPreviews, BLUR_PREVIEW_MAX_BYTES } from "@/lib/photos/blur-preview";

/** A real 800×600 JPEG with detail (noise), like a phone photo */
async function jpeg800x600(): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 34, g: 71, b: 106 }, noise: { type: "gaussian", mean: 128, sigma: 60 } } })
    .jpeg({ quality: 85 })
    .toBuffer();
}

describe("makeBlurPreview", () => {
  it("returns a tiny WebP data URI, longest side ≤ 16 px, ≤ 1 KB", async () => {
    const out = await makeBlurPreview(await jpeg800x600());
    expect(out).not.toBeNull();
    expect(out!.startsWith("data:image/webp;base64,")).toBe(true);
    expect(out!.length).toBeLessThanOrEqual(BLUR_PREVIEW_MAX_BYTES);
    expect(BLUR_PREVIEW_MAX_BYTES).toBe(1024);
    const bytes = Buffer.from(out!.slice("data:image/webp;base64,".length), "base64");
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(16);
    expect(meta.width).toBe(16); // landscape keeps its shape
    expect(meta.height).toBe(12);
    expect(meta.exif).toBeUndefined();
  });

  it("turns a portrait photo upright from its EXIF orientation", async () => {
    const tagged = await sharp(await jpeg800x600()).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await makeBlurPreview(tagged);
    const meta = await sharp(Buffer.from(out!.split(",")[1], "base64")).metadata();
    expect(meta.width).toBe(12);
    expect(meta.height).toBe(16);
  });

  it("returns null for garbage bytes", async () => {
    expect(await makeBlurPreview(Buffer.from("not an image at all"))).toBeNull();
    expect(await makeBlurPreview(Buffer.alloc(0))).toBeNull();
  });
});

describe("primaryPhotoPreview", () => {
  it("picks the primary photo's preview", () => {
    expect(primaryPhotoPreview([
      { isPrimary: false, order: 0, blurPreview: "a" },
      { isPrimary: true, order: 1, blurPreview: "b" },
    ])).toBe("b");
  });
  it("else the lowest order", () => {
    expect(primaryPhotoPreview([
      { isPrimary: false, order: 2, blurPreview: "c" },
      { isPrimary: false, order: 1, blurPreview: "b" },
    ])).toBe("b");
  });
  it("else null (no photos, or the source photo has no preview)", () => {
    expect(primaryPhotoPreview([])).toBeNull();
    expect(primaryPhotoPreview([
      { isPrimary: true, order: 0, blurPreview: null },
      { isPrimary: false, order: 1, blurPreview: "b" },
    ])).toBeNull();
  });
});

describe("refreshMemberPreviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.photo.update.mockResolvedValue({});
  });

  it("fills only rows without a preview, from the stored photo bytes", async () => {
    const img = await jpeg800x600();
    db.photo.findMany.mockResolvedValue([
      { id: "p1", url: "cdn://photos/u1/a.jpg", blurPreview: "data:image/webp;base64,AAAA" },
      { id: "p2", url: "cdn://photos/u1/b.jpg", blurPreview: null },
    ]);
    bunny.readFromBunny.mockResolvedValue(img);
    await refreshMemberPreviews("u1", db as never);
    expect(db.photo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
    expect(bunny.readFromBunny).toHaveBeenCalledTimes(1);
    expect(bunny.readFromBunny).toHaveBeenCalledWith("photos/u1/b.jpg");
    expect(db.photo.update).toHaveBeenCalledTimes(1);
    const call = db.photo.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "p2" });
    expect(call.data.blurPreview.startsWith("data:image/webp;base64,")).toBe(true);
  });

  it("reads a legacy base64 photo stored in the url column", async () => {
    const img = await jpeg800x600();
    db.photo.findMany.mockResolvedValue([{ id: "p1", url: `data:image/jpeg;base64,${img.toString("base64")}`, blurPreview: null }]);
    await refreshMemberPreviews("u1", db as never);
    expect(bunny.readFromBunny).not.toHaveBeenCalled();
    expect(db.photo.update).toHaveBeenCalledTimes(1);
  });

  it("never throws: an unreadable photo stays null and the others are still filled", async () => {
    const img = await jpeg800x600();
    db.photo.findMany.mockResolvedValue([
      { id: "p1", url: "cdn://photos/u1/a.jpg", blurPreview: null },
      { id: "p2", url: "cdn://photos/u1/b.jpg", blurPreview: null },
    ]);
    bunny.readFromBunny.mockRejectedValueOnce(new Error("Bunny read failed (500)")).mockResolvedValueOnce(img);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(refreshMemberPreviews("u1", db as never)).resolves.toBeUndefined();
    expect(db.photo.update).toHaveBeenCalledTimes(1);
    expect(db.photo.update.mock.calls[0][0].where).toEqual({ id: "p2" });
    warn.mockRestore();
  });

  it("never throws when the query itself fails", async () => {
    db.photo.findMany.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(refreshMemberPreviews("u1", db as never)).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe("readPhotoBytes reads only our own photo storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "https://evil.example/x.jpg",
    "http://localhost:3020/api/dev/uploads/x.jpg",
    "file:///etc/passwd",
  ])("%s → null, nothing fetched", async (url) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x"));
    expect(await readPhotoBytes(url)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bunny.readFromBunny).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("a storage URL is read through the storage API", async () => {
    bunny.readFromBunny.mockResolvedValue(Buffer.from("img"));
    expect(await readPhotoBytes("cdn://photos/u1/a.jpg")).toEqual(Buffer.from("img"));
    expect(bunny.readFromBunny).toHaveBeenCalledWith("photos/u1/a.jpg");
  });
});

describe("refreshMemberPreviews with slow storage", () => {
  it("abandons a hanging read after 15 s and goes on with the next photo", async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      db.photo.update.mockResolvedValue({});
      db.photo.findMany.mockResolvedValue([
        { id: "p1", url: "cdn://photos/u1/a.jpg", blurPreview: null },
        { id: "p2", url: "cdn://photos/u1/b.jpg", blurPreview: null },
      ]);
      const img = await jpeg800x600();
      bunny.readFromBunny.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(img);
      const run = refreshMemberPreviews("u1", db as never);
      await vi.advanceTimersByTimeAsync(15_001);
      await run;
      expect(db.photo.update).toHaveBeenCalledTimes(1);
      expect(db.photo.update.mock.calls[0][0].where).toEqual({ id: "p2" });
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});
