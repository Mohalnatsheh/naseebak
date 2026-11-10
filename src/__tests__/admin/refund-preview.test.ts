import { describe, it, expect } from "vitest";
import { refundQuestion } from "@/lib/admin/refund-preview";

describe("admin refund preview (QA WEB-PAY-02)", () => {
  it("names the Pro credits taken back and that Pro ends now", () => {
    const q = refundQuestion({ amount: "35", currency: "JOD", user: { firstName: "سامر", lastName: "دفع", matchCredits: 102 }, credits: 16, endsPro: true });
    // The card paid dollars: the preview names both (WP2-07)
    expect(q.title).toBe("Refund 35.00 JOD (49.35 USD charged) to سامر دفع?");
    expect(q.lines[0]).toBe("16 credits will be taken back. Current balance: 102.");
    expect(q.lines.some((l) => l.includes("Pro ends now"))).toBe(true);
  });
  it("a pack refund says nothing about Pro", () => {
    const q = refundQuestion({ amount: "3", currency: "JOD", user: { firstName: "a", lastName: "b", matchCredits: 4 }, credits: 10 });
    expect(q.lines.join(" ")).not.toContain("Pro");
    expect(q.lines[1]).toContain("stops at 0");
  });
  it("riyals are charged as shown; one credit is singular (ADM-23)", () => {
    const q = refundQuestion({ amount: "15", currency: "SAR", user: { firstName: "a", lastName: "b", matchCredits: 4 }, credits: 1 });
    expect(q.title).toBe("Refund 15.00 SAR to a b?");
    expect(q.lines[0]).toBe("1 credit will be taken back. Current balance: 4.");
  });
});
