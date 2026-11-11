import { describe, it, expect } from "vitest";
import { termsSectionsFor } from "@/app/(ar)/terms/terms-view";

const text = (country: "JO" | "SA" | "LB", jod: boolean) => JSON.stringify(termsSectionsFor(country, true, false, jod));

describe("terms with jod_charging", () => {
  it("Jordan: dollars until the switch, dinars after", () => {
    expect(text("JO", false)).toContain("ويُحصَّل ما يعادلها بالدولار الأمريكي");
    expect(text("JO", true)).not.toContain("بالدولار");
    expect(text("JO", true)).toContain("تُحصَّل بالدينار الأردني");
  });
  it("Lebanon keeps its dollar line, Saudi Arabia is unchanged", () => {
    expect(text("LB", true)).toBe(text("LB", false));
    expect(text("SA", true)).toBe(text("SA", false));
  });
});
