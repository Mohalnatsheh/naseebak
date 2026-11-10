import { describe, it, expect } from "vitest";
import { jsonLd } from "@/lib/json-ld";

describe("jsonLd", () => {
  it("never lets a value close the script tag", () => {
    const out = jsonLd({ headline: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(JSON.parse(out)).toEqual({ headline: "</script><script>alert(1)</script>" });
  });

  it("escapes ampersands and line separators but keeps the data", () => {
    const value = { a: "x & y", b: "line\u2028sep\u2029end", c: "نصيبك" };
    const out = jsonLd(value);
    expect(out).not.toMatch(/[&\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(value);
  });
});
