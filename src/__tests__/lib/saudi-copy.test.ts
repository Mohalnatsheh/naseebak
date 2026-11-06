import { describe, it, expect } from "vitest";
import { saudiAreas } from "@/lib/data/saudi-areas";
import { birthMonths } from "@/lib/birth-date";
import { personSearch } from "@/lib/admin/search";

describe("Saudi members", () => {
  it("the birth month list uses Saudi month names", () => {
    expect(birthMonths("SA")[10]).toBe("نوفمبر");
    expect(birthMonths("JO")[10]).toBe("تشرين الثاني");
  });

  it("an admin finds a Saudi member by their local number", () => {
    const where = personSearch("0512345678");
    expect(JSON.stringify(where)).toContain("966512345678");
    expect(JSON.stringify(personSearch("0791234567"))).toContain("962791234567");
  });
});

describe("Saudi cities", () => {
  const areas = saudiAreas;

  it("lists the large cities outside the regional capitals", () => {
    for (const city of ["الخرج", "حفر الباطن", "بيشة", "الرس", "القريات", "العلا"]) expect(areas[city]).toBeDefined();
  });

  it("keeps separate towns as cities, not as districts of a far capital", () => {
    expect(areas["نجران"]).not.toContain("شرورة");
    expect(areas["شرورة"]).toBeDefined();
    expect(areas["عرعر"]).not.toContain("رفحاء");
    expect(areas["جازان"]).not.toContain("صبيا");
  });

  it("every city has at least one district to pick", () => {
    for (const list of Object.values(areas)) expect(list.length).toBeGreaterThan(0);
  });
});
