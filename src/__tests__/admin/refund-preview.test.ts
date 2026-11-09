import { describe, it, expect } from "vitest";
import { refundQuestion } from "@/lib/admin/refund-preview";

describe("admin refund preview (QA WEB-PAY-02)", () => {
  it("names the Pro credits taken back and that Pro ends now", () => {
    const q = refundQuestion({ amount: "35", currency: "JOD", user: { firstName: "سامر", lastName: "دفع", matchCredits: 102 }, credits: 16, endsPro: true });
    expect(q.title).toBe("Refund 35.00 JOD to سامر دفع?");
    expect(q.lines[0]).toBe("16 credit(s) will be taken back. Current balance: 102.");
    expect(q.lines.some((l) => l.includes("Pro ends now"))).toBe(true);
  });
  it("a pack refund says nothing about Pro", () => {
    const q = refundQuestion({ amount: "3", currency: "JOD", user: { firstName: "a", lastName: "b", matchCredits: 4 }, credits: 10 });
    expect(q.lines.join(" ")).not.toContain("Pro");
    expect(q.lines[1]).toContain("stops at 0");
  });
});
