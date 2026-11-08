import { describe, it, expect } from "vitest";
import { z } from "zod/v4";
import { arabicIssueMessage } from "@/lib/validations/issue-message";
import { profileSchema } from "@/lib/validations/profile";

const firstIssue = (schema: z.ZodType, input: unknown) => {
  const r = schema.safeParse(input);
  if (r.success) throw new Error("expected a failure");
  return r.error.issues[0];
};

describe("arabicIssueMessage", () => {
  it("keeps the schema's own Arabic messages", () => {
    const issue = firstIssue(profileSchema, { dateOfBirth: "1995-01-01", city: "" });
    expect(arabicIssueMessage(issue)).toBe(issue.message);
  });

  it("names the missing field in Arabic instead of Zod's English", () => {
    const issue = firstIssue(z.object({ prefAgeMin: z.number() }), {});
    expect(issue.message).toMatch(/expected number/);
    expect(arabicIssueMessage(issue)).toBe("يرجى إدخال «العمر الأدنى للشريك»");
  });

  it("a wrong type gets an Arabic «please check» line with the field name", () => {
    const issue = firstIssue(z.object({ height: z.number() }), { height: null });
    expect(arabicIssueMessage(issue)).toBe("يرجى التحقق من قيمة «الطول»");
  });

  it("an unknown field falls back to a generic Arabic line", () => {
    const issue = firstIssue(z.object({ somethingNew: z.number() }), { somethingNew: "x" });
    expect(arabicIssueMessage(issue)).toBe("بيانات غير صالحة، يرجى المراجعة والمحاولة مرة أخرى");
  });

  it("nested paths (update-request `changes.x`) use the field's own name", () => {
    const issue = firstIssue(z.object({ changes: z.object({ childrenCount: z.number().int() }) }), { changes: { childrenCount: 1.5 } });
    expect(arabicIssueMessage(issue)).toBe("يرجى التحقق من قيمة «عدد الأبناء»");
  });
});
