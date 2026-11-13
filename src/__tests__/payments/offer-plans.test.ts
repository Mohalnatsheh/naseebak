import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const offer = vi.hoisted(() => ({ percent: 0 }));
const gate = vi.hoisted(() => ({ selling: true }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ currentSession: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/countries/server", () => ({ getVisitorCountry: async () => "JO" }));
vi.mock("@/lib/countries/settings", async (orig) => {
  const real = await orig<typeof import("@/lib/countries/settings")>();
  return { ...real, getCountrySettings: async (c: "JO" | "SA" | "LB") => real.defaultCountrySettings(c), purchasesAvailable: () => gate.selling };
});
vi.mock("@/lib/settings", () => ({
  jodChargingFor: async () => false,
  activeOfferFor: async (selling: boolean) =>
    selling && offer.percent > 0 ? { percent: offer.percent, title: "عروض الجمعة البيضاء", endsAt: "2026-11-30T21:59:00.000Z" } : null,
}));

import { GET } from "@/app/api/payments/plans/route";

beforeEach(() => {
  vi.clearAllMocks();
  offer.percent = 0;
  gate.selling = true;
  db.user.findUnique.mockResolvedValue({ country: "JO" });
});

describe("GET /api/payments/plans with a sale offer", () => {
  it("names each package with its gift and sends the offer, credits stay the base", async () => {
    offer.percent = 50;
    const body = await (await GET()).json();
    expect(body.offer).toMatchObject({ percent: 50, title: "عروض الجمعة البيضاء" });
    const ten = body.packages.find((p: { id: string }) => p.id === "launch_10");
    expect(ten).toMatchObject({ name: "10 أرصدة + 5 هدية", bonusCredits: 5, credits: 10 });
  });

  it("a country not selling (Lebanon today) gets no offer and plain names", async () => {
    offer.percent = 50;
    gate.selling = false;
    db.user.findUnique.mockResolvedValue({ country: "LB" });
    const body = await (await GET()).json();
    expect(body.offer).toBeNull();
    for (const p of body.packages) {
      expect(p.bonusCredits).toBeUndefined();
      expect(p.name).not.toContain("هدية");
    }
  });

  it("offer off: plain packages and offer null", async () => {
    const body = await (await GET()).json();
    expect(body.offer).toBeNull();
    expect(body.packages.find((p: { id: string }) => p.id === "launch_10").name).toBe("10 أرصدة");
  });
});
