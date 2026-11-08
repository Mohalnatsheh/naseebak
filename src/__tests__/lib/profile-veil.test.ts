import { describe, it, expect } from "vitest";
import { applyNiqabRule, veilChoice, veilFromChoice, veilLabel } from "@/lib/profile-veil";

describe("applyNiqabRule", () => {
  it("niqab true stores hijab true", () => {
    expect(applyNiqabRule({ niqab: true })).toEqual({ niqab: true, hijab: true });
    expect(applyNiqabRule({ niqab: true, hijab: false })).toEqual({ niqab: true, hijab: true });
  });

  it("hijab false stores niqab false", () => {
    expect(applyNiqabRule({ hijab: false })).toEqual({ hijab: false, niqab: false });
  });

  it("a body without niqab never touches it (old app 1.0.0 sends hijab only)", () => {
    expect(applyNiqabRule({ hijab: true })).toEqual({ hijab: true });
    expect(applyNiqabRule({ city: "عمان" })).toEqual({ city: "عمان" });
    expect("niqab" in applyNiqabRule({ hijab: true })).toBe(false);
  });

  it("a cleared hijab clears niqab too", () => {
    expect(applyNiqabRule({ hijab: null })).toEqual({ hijab: null, niqab: null });
  });

  it("niqab false or null leaves hijab as sent", () => {
    expect(applyNiqabRule({ niqab: false, hijab: true })).toEqual({ niqab: false, hijab: true });
    expect(applyNiqabRule({ niqab: false })).toEqual({ niqab: false });
  });

  it("does not mutate its input", () => {
    const body = { niqab: true };
    applyNiqabRule(body);
    expect(body).toEqual({ niqab: true });
  });
});

describe("veil display and choice", () => {
  it("labels: منتقبة if niqab, else محجبة / غير محجبة, null when not answered", () => {
    expect(veilLabel(true, true)).toBe("منتقبة");
    expect(veilLabel(true, false)).toBe("محجبة");
    expect(veilLabel(true, null)).toBe("محجبة");
    expect(veilLabel(false, null)).toBe("غير محجبة");
    expect(veilLabel(null, null)).toBeNull();
    expect(veilLabel(undefined, undefined)).toBeNull();
  });

  it("maps the three choices to (hijab, niqab) and back", () => {
    expect(veilFromChoice("محجبة")).toEqual({ hijab: true, niqab: false });
    expect(veilFromChoice("منتقبة")).toEqual({ hijab: true, niqab: true });
    expect(veilFromChoice("غير محجبة")).toEqual({ hijab: false, niqab: false });
    expect(veilChoice(true, true)).toBe("منتقبة");
    expect(veilChoice(true, null)).toBe("محجبة");
    expect(veilChoice(false, false)).toBe("غير محجبة");
    expect(veilChoice(null, null)).toBeNull();
  });
});
