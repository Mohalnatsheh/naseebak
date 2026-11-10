import { describe, it, expect } from "vitest";
import { invalidFields } from "@/lib/admin/invalid-fields";

describe("invalidFields (ADM-16)", () => {
  it("lists every field in English", () => {
    expect(
      invalidFields([
        { path: ["title"], message: "Required" },
        { path: ["slug"], message: "Invalid string" },
      ]),
    ).toBe("Invalid: title (Required); slug (Invalid string)");
  });
  it("drops Arabic messages but keeps the field", () => {
    expect(invalidFields([{ path: ["firstName"], message: "الاسم الأول مطلوب" }])).toBe("Invalid: firstName");
  });
  it("has a fallback", () => {
    expect(invalidFields([])).toBe("Invalid data");
  });
});
