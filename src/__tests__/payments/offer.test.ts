import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { systemSetting: { findUnique } } }));

import { bonusFor, DEFAULT_OFFER_TITLE, offerOpenAt, offerPackageName, type OfferSettings } from "@/lib/payments/offer";
import { activeOfferFor, getOfferSettings } from "@/lib/settings";

const start = new Date("2026-11-27T00:00:00Z");
const end = new Date("2026-11-30T21:59:00Z");
const on: OfferSettings = { percent: 50, startsAt: start, endsAt: end, title: "عروض الجمعة البيضاء" };

describe("offer maths", () => {
  it("rounds the bonus up", () => {
    expect(bonusFor(10, 50)).toBe(5);
    expect(bonusFor(25, 50)).toBe(13);
    expect(bonusFor(5, 0)).toBe(0);
    expect(bonusFor(0, 50)).toBe(0);
  });

  it("is open only inside the window with a percent", () => {
    expect(offerOpenAt(on, start)).toBe(true);
    expect(offerOpenAt(on, new Date(start.getTime() - 1))).toBe(false);
    expect(offerOpenAt(on, end)).toBe(false);
    expect(offerOpenAt({ ...on, percent: 0 }, start)).toBe(false);
    expect(offerOpenAt({ ...on, startsAt: null }, start)).toBe(false);
    expect(offerOpenAt({ ...on, endsAt: null }, start)).toBe(false);
  });

  it("names a package with its gift", () => {
    expect(offerPackageName("10 أرصدة", 5)).toBe("10 أرصدة + 5 هدية");
  });
});

describe("offer settings", () => {
  const rows: Record<string, string> = {};
  beforeEach(() => {
    for (const k of Object.keys(rows)) delete rows[k];
    findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => (where.key in rows ? { key: where.key, value: rows[where.key] } : null));
  });

  it("is off by default", async () => {
    const s = await getOfferSettings();
    expect(s.percent).toBe(0);
    expect(await activeOfferFor(true, start)).toBeNull();
  });

  it("reads the window and falls back to the default title", async () => {
    rows.offer_bonus_percent = "50";
    rows.offer_starts_at = start.toISOString();
    rows.offer_ends_at = end.toISOString();
    rows.offer_title = "";
    // settings are cached 30 s: use a fresh module instance
    vi.resetModules();
    const fresh = await import("@/lib/settings");
    expect(await fresh.activeOfferFor(true, start)).toEqual({ percent: 50, title: DEFAULT_OFFER_TITLE, endsAt: end.toISOString() });
    expect(await fresh.activeOfferFor(false, start)).toBeNull();
    expect(await fresh.activeOfferFor(true, end)).toBeNull();
  });

  it("reads a bad percent or date as off", async () => {
    rows.offer_bonus_percent = "150";
    rows.offer_starts_at = "nonsense";
    rows.offer_ends_at = end.toISOString();
    vi.resetModules();
    const fresh = await import("@/lib/settings");
    const s = await fresh.getOfferSettings();
    expect(s.percent).toBe(0);
    expect(s.startsAt).toBeNull();
  });
});
