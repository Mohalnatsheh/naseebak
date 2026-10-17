import { describe, it, expect } from "vitest";
import { nationalityLabel } from "@/lib/profile-options";

describe("nationalityLabel", () => {
  it("writes the nationality in the person's gender", () => {
    expect(nationalityLabel("أردني", "FEMALE")).toBe("أردنية");
    expect(nationalityLabel("أردنية", "MALE")).toBe("أردني");
    expect(nationalityLabel("أردنية", "FEMALE")).toBe("أردنية");
    expect(nationalityLabel("أردني", "MALE")).toBe("أردني");
    expect(nationalityLabel(null, "MALE")).toBeNull();
  });
});
