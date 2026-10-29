import { describe, it, expect } from "vitest";
import { ammanDay, changePct, conversionPct, fillDays, sumDays } from "@/lib/admin/revenue";

describe("revenue helpers", () => {
  it("uses the Amman day (UTC+3)", () => {
    expect(ammanDay(new Date("2026-10-28T20:59:00Z"))).toBe("2026-10-28");
    expect(ammanDay(new Date("2026-10-28T21:00:00Z"))).toBe("2026-10-29");
  });

  it("fills the last N days, oldest first, zeros where nothing happened", () => {
    const now = new Date("2026-10-29T09:00:00Z");
    const days = fillDays([{ day: "2026-10-28", started: 5, paid: 2, revenue: 6, payers: 2, refunded: 0 }], now, 3);
    expect(days.map((d) => d.day)).toEqual(["2026-10-27", "2026-10-28", "2026-10-29"]);
    expect(days[0]).toMatchObject({ revenue: 0, paid: 0 });
    expect(days[1]).toMatchObject({ revenue: 6, paid: 2 });
  });

  it("works out changes and checkout completion", () => {
    expect(changePct(30, 20)).toBe(50);
    expect(changePct(10, 20)).toBe(-50);
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(0, 0)).toBe(0);
    expect(conversionPct(18, 68)).toBe(26);
    expect(conversionPct(0, 0)).toBeNull();
  });

  it("adds periods up", () => {
    expect(sumDays([
      { day: "a", started: 3, paid: 1, revenue: 3, payers: 1, refunded: 0 },
      { day: "b", started: 4, paid: 2, revenue: 9, payers: 2, refunded: 3 },
    ])).toEqual({ revenue: 12, paid: 3, started: 7, refunded: 3 });
  });
});
