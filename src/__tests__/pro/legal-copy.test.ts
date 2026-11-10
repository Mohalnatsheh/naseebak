import { describe, it, expect } from "vitest";
import {
  PACKS_LINE_OLD, PACKS_NOT_A_SUBSCRIPTION, PRO_REFUND_SECTION, PRO_TERMS_LINE, TERMS_LINE_OLD, refundIntro, withProRefund, withProTerms,
} from "@/lib/pro/legal-copy";

const policy = [
  { title: "ما الذي تشتريه", items: ["a", PACKS_LINE_OLD] },
  { title: "حالات لا يشملها الاسترداد", items: ["b"] },
  { title: "كيف تطلب الاسترداد", items: ["c"] },
];

describe("Pro in the legal pages (WP2-01)", () => {
  it("nothing about Pro while it isn't sold", () => {
    expect(withProRefund(policy, false, PRO_REFUND_SECTION)).toBe(policy);
    expect(withProTerms([{ items: [TERMS_LINE_OLD] }], false)[0].items).toEqual([TERMS_LINE_OLD]);
    expect(refundIntro(false)).not.toContain("Pro");
  });

  it("while sold: no more «no subscription», and the Pro section after the exclusions", () => {
    const out = withProRefund(policy, true, PRO_REFUND_SECTION);
    expect(out.map((s) => s.title)).toEqual(["ما الذي تشتريه", "حالات لا يشملها الاسترداد", "عضوية Pro", "كيف تطلب الاسترداد"]);
    expect(out[0].items).toEqual(["a", PACKS_NOT_A_SUBSCRIPTION]);
    expect(JSON.stringify(out)).not.toContain("لا يوجد اشتراك ولا تجديد تلقائي");
    expect(withProTerms([{ items: [TERMS_LINE_OLD] }], true)[0].items).toEqual([PRO_TERMS_LINE]);
    expect(refundIntro(true)).toContain("اشتراكات عضوية Pro");
  });

  it("states the code's rules: auto-renewal, cancel any time, no refund of a period in progress except duplicates and not-live payments", () => {
    const text = PRO_REFUND_SECTION.items.join(" ");
    for (const piece of ["يتجدد تلقائياً", "إلغاء التجديد في أي وقت", "شهرياً على مدار السنة", "الخصم المكرر", "لم تُفعّل عضوية Pro", "تنتهي العضوية فوراً", "دون استرداد"]) {
      expect(text).toContain(piece);
    }
  });
});
