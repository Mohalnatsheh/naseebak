import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

type Row = { id: string; userId: string; url: string; isPrimary: boolean; order: number; blurPreview: string | null; createdAt: Date };

// A small in-memory photos table: enough of Prisma for the photo routes
const store = vi.hoisted(() => ({ rows: [] as Row[], nextId: 1 }));
const db = vi.hoisted(() => {
  const match = (r: Row, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v);
  const sorted = (rows: Row[]) => [...rows].sort((a, b) => a.order - b.order);
  const db = {
    photo: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => store.rows.filter((r) => match(r, where)).length),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => store.rows.find((r) => r.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => sorted(store.rows.filter((r) => match(r, where)))[0] ?? null),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => sorted(store.rows.filter((r) => match(r, where)))),
      create: vi.fn(async ({ data }: { data: Omit<Row, "id" | "createdAt" | "blurPreview"> & { blurPreview?: string | null } }) => {
        const row: Row = { ...data, blurPreview: data.blurPreview ?? null, id: `p${store.nextId++}`, createdAt: new Date() };
        store.rows.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = store.rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const rows = store.rows.filter((r) => match(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const i = store.rows.findIndex((r) => r.id === where.id);
        return store.rows.splice(i, 1)[0];
      }),
    },
    $transaction: vi.fn(async (arg: unknown) => (typeof arg === "function" ? arg(db) : Promise.all(arg as Promise<unknown>[]))),
  };
  return db;
});
const files = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ session: { user: { id: "u1", role: "USER" } } })),
}));
vi.mock("@/lib/referral", () => ({ maybeAwardReferral: vi.fn(async () => undefined) }));
vi.mock("@/lib/bunny", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/bunny")>();
  return {
    ...real,
    getBunnyPathFromUrl: (url: string) => (url.startsWith("cdn://") ? url.slice(6) : null),
    uploadBase64ToBunny: vi.fn(async (dataUrl: string, path: string) => {
      files.set(`${path}.jpg`, real.base64ToBuffer(dataUrl)!.buffer);
      return `cdn://${path}.jpg`;
    }),
    readFromBunny: vi.fn(async (path: string) => files.get(path) ?? null),
    deleteFromBunny: vi.fn(async (path: string) => { files.delete(path); }),
  };
});

import { POST } from "@/app/api/profile/photos/route";
import { DELETE, PATCH } from "@/app/api/profile/photos/[id]/route";
import { primaryPhotoPreview } from "@/lib/photos/blur-preview";

async function photoDataUrl(r: number, g: number, b: number): Promise<string> {
  const buf = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}
const upload = (photoData: string, isPrimary = false) =>
  POST(new Request("http://x/api/profile/photos", { method: "POST", body: JSON.stringify({ photoData, isPrimary }) }));
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  store.rows = [];
  store.nextId = 1;
  files.clear();
});

describe("photo upload stores a blurred preview", () => {
  it("the new row carries a tiny WebP preview", async () => {
    const res = await upload(await photoDataUrl(200, 30, 30));
    expect(res.status).toBe(200);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].blurPreview).toMatch(/^data:image\/webp;base64,/);
    expect(store.rows[0].blurPreview!.length).toBeLessThanOrEqual(1024);
    // My own photos answer never carries the preview field
    const body = await res.json();
    expect(body.photo.blurPreview).toBeUndefined();
    expect(body.photo.url).toBe(store.rows[0].url);
  });

  it("a photo the preview can't be made from is still saved (preview null)", async () => {
    // Passes the route's format check, but isn't a decodable image
    const garbage = `data:image/jpeg;base64,${Buffer.from("definitely not a jpeg").toString("base64")}`;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await upload(garbage);
    expect(res.status).toBe(200);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].blurPreview).toBeNull();
    err.mockRestore();
    warn.mockRestore();
  });
});

describe("delete and set-primary keep the member's preview right", () => {
  it("deleting the primary photo leaves the next photo's preview as the member's", async () => {
    await upload(await photoDataUrl(200, 30, 30)); // p1, primary
    await upload(await photoDataUrl(30, 200, 30)); // p2
    const [p1, p2] = store.rows;
    expect(p1.isPrimary).toBe(true);
    expect(primaryPhotoPreview(store.rows)).toBe(p1.blurPreview);
    const p2Preview = p2.blurPreview;
    expect(p2Preview).not.toBeNull();
    expect(p2Preview).not.toBe(p1.blurPreview);

    const res = await DELETE(new Request("http://x"), params(p1.id));
    expect(res.status).toBe(200);
    expect(store.rows).toHaveLength(1);
    expect(primaryPhotoPreview(store.rows)).toBe(p2Preview);
  });

  it("a remaining photo without a preview (older row) gets one in the same request", async () => {
    await upload(await photoDataUrl(200, 30, 30));
    await upload(await photoDataUrl(30, 200, 30));
    const [p1, p2] = store.rows;
    p2.blurPreview = null; // e.g. uploaded before the column existed
    await DELETE(new Request("http://x"), params(p1.id));
    expect(store.rows[0].blurPreview).toMatch(/^data:image\/webp;base64,/);
    expect(primaryPhotoPreview(store.rows)).toBe(store.rows[0].blurPreview);
  });

  it("deleting the last photo leaves no preview", async () => {
    await upload(await photoDataUrl(200, 30, 30));
    await DELETE(new Request("http://x"), params(store.rows[0].id));
    expect(primaryPhotoPreview(store.rows)).toBeNull();
  });

  it("making another photo primary switches the member's preview to it", async () => {
    await upload(await photoDataUrl(200, 30, 30));
    await upload(await photoDataUrl(30, 200, 30));
    const p2 = store.rows[1];
    p2.blurPreview = null;
    const res = await PATCH(new Request("http://x"), params(p2.id));
    expect(res.status).toBe(200);
    expect(p2.isPrimary).toBe(true);
    expect(p2.blurPreview).toMatch(/^data:image\/webp;base64,/);
    expect(primaryPhotoPreview(store.rows)).toBe(p2.blurPreview);
  });
});
