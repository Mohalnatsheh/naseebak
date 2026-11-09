import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { plural } from "@/components/admin/daily-jobs-card";
import { MAX_OPEN_SUGGESTIONS } from "@/lib/matching/auto-suggest";

describe("admin copy (QA WEB-PAY-15)", () => {
  it("plural: «pushes», «reminders», «1 task»", () => {
    expect(plural(0, "re-engagement push")).toBe("0 re-engagement pushes");
    expect(plural(3, "reminder")).toBe("3 reminders");
    expect(plural(1, "task")).toBe("1 task");
  });
  it("the credit-on-interest switch states the real open-suggestion limit", () => {
    const text = readFileSync("src/components/admin/new-cycle-settings-card.tsx", "utf8");
    expect(text).toContain(`(${MAX_OPEN_SUGGESTIONS} open at a time`);
  });
});
