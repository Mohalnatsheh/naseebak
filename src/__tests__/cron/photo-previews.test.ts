import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ photo: { findMany: vi.fn(), update: vi.fn() } }));
const blur = vi.hoisted(() => ({ makeBlurPreview: vi.fn(), readPhotoBytes: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/photos/blur-preview", () => blur);

import { fillPhotoPreviews } from "@/lib/cron/photo-previews";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  blur.readPhotoBytes.mockResolvedValue(Buffer.from("x"));
  blur.makeBlurPreview.mockResolvedValue("data:image/webp;base64,AAAA");
});

describe("fillPhotoPreviews", () => {
  it("selects only null previews, oldest first, and fills them", async () => {
    db.photo.findMany.mockResolvedValue([{ id: "p1", url: "u1" }, { id: "p2", url: "u2" }]);
    const r = await fillPhotoPreviews();
    expect(db.photo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blurPreview: null }, orderBy: { id: "asc" }, take: 200 }),
    );
    expect(db.photo.update).toHaveBeenCalledTimes(2);
    expect(db.photo.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { blurPreview: "data:image/webp;base64,AAAA" } });
    expect(r).toMatchObject({ filled: 2, failed: 0, lastId: "p2" });
  });

  it("writes only blurPreview (never touches the user)", async () => {
    db.photo.findMany.mockResolvedValue([{ id: "p1", url: "u1" }]);
    await fillPhotoPreviews();
    expect(Object.keys(db.photo.update.mock.calls[0][0].data)).toEqual(["blurPreview"]);
  });

  it("a throwing or unprocessable row does not stop the batch, and is logged by id without the url", async () => {
    db.photo.findMany.mockResolvedValue([
      { id: "p1", url: "https://secret/host/a.jpg" },
      { id: "p2", url: "u2" },
      { id: "p3", url: "u3" },
    ]);
    blur.readPhotoBytes.mockRejectedValueOnce(new Error("fetch failed: https://secret/host/a.jpg"));
    blur.makeBlurPreview.mockResolvedValueOnce(null);
    const r = await fillPhotoPreviews();
    expect(r).toMatchObject({ filled: 1, failed: 2 });
    expect(db.photo.update).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify((console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).toContain("p1");
    expect(logged).not.toContain("secret");
  });

  it("respects the limit and the cursor", async () => {
    db.photo.findMany.mockResolvedValue([]);
    const r = await fillPhotoPreviews({ limit: 5, after: "p9" });
    expect(db.photo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blurPreview: null, id: { gt: "p9" } }, take: 5 }),
    );
    expect(r).toEqual({ filled: 0, failed: 0, lastId: undefined });
  });
});
