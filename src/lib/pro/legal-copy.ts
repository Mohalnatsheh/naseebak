/**
 * Pro in the refund policy and the terms (QA WP2-01, 2026-11-11). Db-free so the client pages can import it.
 *
 * Shown only while Pro is sold in the visitor's country (`pro_enabled`, purchases open and a plan with a price):
 * public pages never describe a switched-off feature. The text states the code's actual rules. The owner's 14-day
 * question for Pro is still open, so the refund line says no refund for a period in progress except a duplicate
 * charge or a payment that didn't make Pro live — OWNER MUST APPROVE THIS WORDING before `pro_enabled` goes on.
 */

/** «آخر تحديث» of both pages while the Pro text shows */
export const PRO_LEGAL_UPDATED = "10 نوفمبر 2026";

/** Replaces «لا يوجد اشتراك ولا تجديد تلقائي…» in the refund policy while Pro is sold */
export const PACKS_NOT_A_SUBSCRIPTION =
  "باقات الأرصدة دفعة واحدة دون اشتراك ولا تجديد تلقائي، ويبقى الرصيد في حسابك حتى استخدامه. أما عضوية Pro فاشتراك يتجدد تلقائياً، وقواعدها في قسم «عضوية Pro» أدناه.";

/** The refund policy's «عضوية Pro» section */
export const PRO_REFUND_SECTION = {
  title: "عضوية Pro",
  items: [
    "عضوية Pro اشتراك يتجدد تلقائياً كل أسبوع أو شهر أو سنة حسب الخطة التي تختارها، ويُخصم سعرها من البطاقة نفسها عند كل تجديد حتى تلغيه.",
    "يمكنك إلغاء التجديد في أي وقت من صفحة عضوية Pro، وتبقى مزايا العضوية حتى نهاية الفترة المدفوعة دون أي خصم جديد.",
    "تُضاف أرصدة الخطة إلى حسابك مع كل دفعة، وفي الخطة السنوية تُضاف شهرياً على مدار السنة.",
    "لا يُسترد مبلغ فترة بدأت ولا جزء منه، باستثناء الخصم المكرر أو دفعة لم تُفعّل عضوية Pro (مثل اشتراك ثانٍ أثناء عضوية فعّالة، أو تجديد وصل بعد انتهاء العضوية)، فتُسترد كاملة.",
    "عند استرداد دفعة Pro تُخصم أرصدة تلك الدفعة من حسابك، وإذا كانت دفعة الفترة الحالية تنتهي العضوية فوراً.",
    "إيقاف الحساب مؤقتاً أو طلب حذفه يوقف التجديد دون استرداد، وتبقى المزايا حتى نهاية الفترة المدفوعة؛ وإن كان دفع التجديد متعثّراً تنتهي العضوية فوراً دون أي دفعة أخرى. حذف الحساب نهائياً ينهي العضوية فوراً.",
  ],
};

/** Replaces «لا يوجد اشتراك شهري…» in the terms while Pro is sold */
export const PRO_TERMS_LINE =
  "باقات الأرصدة دفعة واحدة دون اشتراك، ويبقى الرصيد المشترى في الحساب حتى استخدامه. عضوية Pro اشتراك اختياري يتجدد تلقائياً حتى تلغيه، ويمكن إلغاؤه في أي وقت مع بقاء المزايا حتى نهاية الفترة المدفوعة، وتفاصيل استرداده في سياسة الاسترداد.";

/** The refund policy intro, with or without Pro */
export function refundIntro(proSold: boolean): string {
  return proSold
    ? "سياسة الاسترداد هذه جزء من شروط استخدام منصة نصيبك، وتنطبق على جميع عمليات شراء الأرصدة واشتراكات عضوية Pro عبر المنصة. الأرصدة خدمة رقمية تُضاف إلى حسابك فور الدفع، لذلك نوضح هنا بدقة الحالات التي يحق لك فيها استرداد المبلغ وكيفية طلبه."
    : "سياسة الاسترداد هذه جزء من شروط استخدام منصة نصيبك، وتنطبق على جميع عمليات شراء الأرصدة عبر المنصة. الأرصدة خدمة رقمية تُضاف إلى حسابك فور الدفع، لذلك نوضح هنا بدقة الحالات التي يحق لك فيها استرداد المبلغ وكيفية طلبه.";
}

/** Old line → line while Pro is sold; other lines unchanged */
export const PACKS_LINE_OLD = "لا يوجد اشتراك ولا تجديد تلقائي؛ كل عملية شراء دفعة واحدة، ويبقى الرصيد في حسابك حتى استخدامه.";
export const TERMS_LINE_OLD = "لا يوجد اشتراك شهري، ويبقى الرصيد المشترى في الحساب حتى استخدامه.";

/** Sections with Pro applied (refund policy): the packs line swapped, the Pro section after «حالات لا يشملها الاسترداد» */
export function withProRefund<T extends { title: string; items: string[] }>(sections: T[], proSold: boolean, proSection: T): T[] {
  if (!proSold) return sections;
  const out = sections.map((s) => ({ ...s, items: s.items.map((i) => (i === PACKS_LINE_OLD ? PACKS_NOT_A_SUBSCRIPTION : i)) }));
  const at = out.findIndex((s) => s.title === "حالات لا يشملها الاسترداد");
  out.splice(at >= 0 ? at + 1 : out.length, 0, proSection);
  return out;
}

/** Terms with Pro applied: the «no subscription» line swapped */
export function withProTerms<T extends { items: string[] }>(sections: T[], proSold: boolean): T[] {
  if (!proSold) return sections;
  return sections.map((s) => ({ ...s, items: s.items.map((i) => (i === TERMS_LINE_OLD ? PRO_TERMS_LINE : i)) }));
}
