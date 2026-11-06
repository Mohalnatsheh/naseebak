import { describe, it, expect } from "vitest";
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
