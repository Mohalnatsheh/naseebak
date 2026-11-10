import { describe, it, expect } from "vitest";
import { toDecimalText } from "@/lib/digits";

describe("toDecimalText (ADM-15)", () => {
  it("keeps a price typed with Arabic digits and decimal mark", () => {
    expect(toDecimalText("١٢٫٥")).toBe("12.5");
    expect(toDecimalText("6,00")).toBe("6.00");
    expect(toDecimalText("4.5.1 JOD")).toBe("4.51");
    expect(toDecimalText("")).toBe("");
  });
});
