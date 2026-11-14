import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ photo: { findMany: vi.fn(), update: vi.fn() } }));
const blur = vi.hoisted(() => ({ makeBlurPreview: vi.fn(), readPhotoBytes: vi.fn() }));
const settings = vi.hoisted(() => ({ getSetting: vi.fn(), setSetting: vi.fn() }));
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/photos/blur-preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/photos/blur-preview")>()),
  ...blur,
}));

import { fillPhotoPreviews, runPhotoPreviewSweep, PREVIEW_CURSOR_KEY, PREVIEW_READ_TIMEOUT_MS, PREVIEW_DEADLINE_MS, backfillAllPreviews } from "@/lib/cron/photo-previews";

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
    expect(r).toEqual({ filled: 0, failed: 0, lastId: undefined, rows: 0, cut: false });
  });
});

describe("sweep cursor and time bounds", () => {
  it("continues after the stored cursor and saves the last id", async () => {
    settings.getSetting.mockResolvedValue("p5");
    db.photo.findMany.mockResolvedValue([{ id: "p6", url: "u" }, { id: "p7", url: "u" }]);
    await runPhotoPreviewSweep(2);
    expect(db.photo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { blurPreview: null, id: { gt: "p5" } } }));
    expect(settings.setSetting).toHaveBeenCalledWith(PREVIEW_CURSOR_KEY, "p7");
  });

  it("wraps around: fewer rows than the limit resets the cursor", async () => {
    settings.getSetting.mockResolvedValue("p7");
    db.photo.findMany.mockResolvedValue([{ id: "p8", url: "u" }]);
    await runPhotoPreviewSweep(2);
    expect(settings.setSetting).toHaveBeenCalledWith(PREVIEW_CURSOR_KEY, "");
  });

  it("an empty cursor starts from the beginning", async () => {
    settings.getSetting.mockResolvedValue("");
    db.photo.findMany.mockResolvedValue([]);
    await runPhotoPreviewSweep(2);
    expect(db.photo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { blurPreview: null } }));
  });

  it("a read that hangs is abandoned after 15 s and the batch goes on", async () => {
    vi.useFakeTimers();
    try {
      db.photo.findMany.mockResolvedValue([{ id: "p1", url: "u" }, { id: "p2", url: "u" }]);
      blur.readPhotoBytes.mockImplementationOnce(() => new Promise(() => {}));
      const run = fillPhotoPreviews();
      await vi.advanceTimersByTimeAsync(PREVIEW_READ_TIMEOUT_MS + 1);
      const r = await run;
      expect(r).toMatchObject({ filled: 1, failed: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops starting new rows after the deadline and the cursor stops at the last one tried", async () => {
    vi.useFakeTimers();
    try {
      db.photo.findMany.mockResolvedValue([{ id: "p1", url: "u" }, { id: "p2", url: "u" }, { id: "p3", url: "u" }]);
      blur.readPhotoBytes.mockImplementationOnce(async () => {
        vi.advanceTimersByTime(PREVIEW_DEADLINE_MS + 1);
        return Buffer.from("x");
      });
      const r = await fillPhotoPreviews();
      expect(r).toMatchObject({ filled: 1, failed: 0, lastId: "p1" });
      expect(blur.readPhotoBytes).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("deadline cut, no-deadline mode and the backfill loop", () => {
  it("a deadline cut keeps the cursor at the last row tried instead of resetting", async () => {
    vi.useFakeTimers();
    try {
      settings.getSetting.mockResolvedValue("");
      db.photo.findMany.mockResolvedValue([{ id: "p1", url: "u" }, { id: "p2", url: "u" }]);
      blur.readPhotoBytes.mockImplementationOnce(async () => {
        vi.advanceTimersByTime(PREVIEW_DEADLINE_MS + 1);
        return Buffer.from("x");
      });
      await runPhotoPreviewSweep(5); // 2 rows < limit 5, but the run was cut
      expect(settings.setSetting).toHaveBeenCalledWith(PREVIEW_CURSOR_KEY, "p1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("deadlineMs null never cuts", async () => {
    vi.useFakeTimers();
    try {
      db.photo.findMany.mockResolvedValue([{ id: "p1", url: "u" }, { id: "p2", url: "u" }]);
      blur.readPhotoBytes.mockImplementationOnce(async () => {
        vi.advanceTimersByTime(PREVIEW_DEADLINE_MS * 5);
        return Buffer.from("x");
      });
      const r = await fillPhotoPreviews({ deadlineMs: null });
      expect(r).toMatchObject({ filled: 2, cut: false, lastId: "p2" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("the backfill loop runs full batches past the deadline and stops on a short one", async () => {
    db.photo.findMany
      .mockResolvedValueOnce([{ id: "p1", url: "u" }, { id: "p2", url: "u" }])
      .mockResolvedValueOnce([{ id: "p3", url: "u" }]);
    blur.readPhotoBytes.mockResolvedValueOnce(null); // p1 fails and is passed
    const seen: unknown[] = [];
    const r = await backfillAllPreviews(2, (b) => seen.push(b));
    expect(r).toEqual({ filled: 2, failed: 1 });
    expect(db.photo.findMany).toHaveBeenCalledTimes(2);
    expect(db.photo.findMany.mock.calls[1][0].where).toEqual({ blurPreview: null, id: { gt: "p2" } });
    expect(seen).toHaveLength(2);
  });
});
