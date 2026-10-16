import { describe, it, expect } from "vitest";
import { cn, arabicCount } from "@/lib/utils";

describe("cn utility", () => {
  it("should merge class names", () => {
    const result = cn("text-sm", "font-bold");
    expect(result).toBe("text-sm font-bold");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    const result = cn("base-class", isActive && "active-class");
    expect(result).toContain("active-class");
  });

  it("should handle falsy values", () => {
    const result = cn("base-class", false, null, undefined, "other-class");
    expect(result).toBe("base-class other-class");
  });

  it("should merge conflicting tailwind classes", () => {
    const result = cn("text-red-500", "text-blue-500");
    expect(result).toBe("text-blue-500");
  });

  it("should handle empty input", () => {
    const result = cn();
    expect(result).toBe("");
  });

  it("should handle array of classes", () => {
    const result = cn(["text-sm", "font-bold"]);
    expect(result).toBe("text-sm font-bold");
  });
});

describe("arabicCount", () => {
  const fields = { one: "حقل واحد", two: "حقلان", few: "حقول", many: "حقلاً" };
  it("uses the right form for each count", () => {
    expect(arabicCount(1, fields)).toBe("حقل واحد");
    expect(arabicCount(2, fields)).toBe("حقلان");
    expect(arabicCount(8, fields)).toBe("8 حقول");
    expect(arabicCount(11, fields)).toBe("11 حقلاً");
    expect(arabicCount(103, fields)).toBe("103 حقول");
  });
});

describe("parsePagination with bad input", () => {
  it("falls back to page 1 for non-numbers", async () => {
    const { parsePagination } = await import("@/lib/utils");
    expect(parsePagination(new URLSearchParams("page=abc"), 20)).toEqual({ page: 1, pageSize: 20, skip: 0 });
  });
});
