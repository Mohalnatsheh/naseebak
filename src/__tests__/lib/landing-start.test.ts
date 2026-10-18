import { describe, it, expect } from "vitest";
import { cleanStartPhone, saveLandingStart, takeLandingStart, LANDING_START_KEY } from "@/lib/landing-start";

function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("cleanStartPhone", () => {
  it("accepts Jordanian mobiles in any format, incl. Arabic-Indic digits", () => {
    expect(cleanStartPhone("079 123 4567")).toBe("0791234567");
    expect(cleanStartPhone("٠٧٩١٢٣٤٥٦٧")).toBe("0791234567");
    expect(cleanStartPhone("+962791234567")).toBe("+962791234567");
  });
  it("empty is allowed, anything else is refused", () => {
    expect(cleanStartPhone("  ")).toBe("");
    expect(cleanStartPhone("123")).toBeNull();
    expect(cleanStartPhone("0761234567")).toBeNull();
  });
});

describe("landing → register hand-off", () => {
  it("round-trips gender and phone once, then is gone", () => {
    const s = memory();
    saveLandingStart(s, { gender: "FEMALE", phone: "0791234567" }, 1000);
    expect(takeLandingStart(s, 2000)).toEqual({ gender: "FEMALE", phone: "0791234567", at: 1000 });
    expect(takeLandingStart(s, 2000)).toBeNull();
  });
  it("ignores a stale, malformed or tampered hand-off", () => {
    const s = memory();
    saveLandingStart(s, { gender: "MALE", phone: "" }, 0);
    expect(takeLandingStart(s, 31 * 60 * 1000)).toBeNull();
    s.setItem(LANDING_START_KEY, "{not json");
    expect(takeLandingStart(s)).toBeNull();
    s.setItem(LANDING_START_KEY, JSON.stringify({ gender: "ADMIN", phone: "", at: Date.now() }));
    expect(takeLandingStart(s)).toBeNull();
    s.setItem(LANDING_START_KEY, JSON.stringify({ gender: "MALE", phone: "<script>", at: Date.now() }));
    expect(takeLandingStart(s)?.phone).toBe("");
  });
  it("never throws when storage is unavailable", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    expect(() => saveLandingStart(broken, { gender: "MALE", phone: "" })).not.toThrow();
    expect(takeLandingStart(broken)).toBeNull();
    expect(takeLandingStart(undefined)).toBeNull();
  });
});
