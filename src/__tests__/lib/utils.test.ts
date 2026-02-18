import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

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
