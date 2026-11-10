/** Texts of Pro notices shared by several modules (db-free, so no module cycle between the webhook and manage code) */
export const PRO_ENDED_TITLE = "انتهت عضوية Pro";
export const PRO_ENDED_BODY = "يمكنك الاشتراك في Pro من جديد في أي وقت من صفحة عضوية Pro.";
/** A renewal payment failed: there is no card update here (Stripe retries), so say what happens and what can be done */
export const PRO_FAILED_TITLE = "تعذّر تجديد اشتراك Pro";
export const PRO_FAILED_BODY = "سنحاول الدفع مرة أخرى خلال الأيام القادمة. إن انتهت العضوية يمكنك الاشتراك من جديد ببطاقة أخرى من صفحة عضوية Pro.";
/**
 * A paid Pro invoice that did not make Pro live (QA WEB-PAY-05). The policy refunds such a payment in full, and refunds
 * are made by an admin (owner rule), so the notice promises the team's refund (QA WP2-03). Its credits, granted like any
 * paid invoice, are told here in the same notice, not in a separate «رصيد Pro» (QA WP2-08).
 */
export const PRO_NOT_LIVE_TITLE = "دفعة Pro إضافية";
export const PRO_DUPLICATE_BODY = "وصلتنا دفعة لاشتراك Pro ثانٍ بينما اشتراكك فعّال، فأوقفنا الاشتراك الثاني. سيستردّ فريق نصيبك مبلغ هذه الدفعة إلى بطاقتك.";
export const PRO_AFTER_END_BODY = "وصلتنا دفعة تجديد بعد انتهاء عضوية Pro، ولم تُستأنف العضوية. سيستردّ فريق نصيبك مبلغ هذه الدفعة إلى بطاقتك.";
/** The credits line added when the not-live payment granted credits; `count` from arabicCount */
export function proNotLiveCreditsLine(count: string): string {
  return `أُضيف ${count} إلى رصيدك من هذه الدفعة، ويُزال عند استردادها.`;
}
/** Added to the refund notice when the refunded payment paid the current period (QA WP2-04) */
export const PRO_REFUND_ENDED_LINE = "وانتهت عضوية Pro.";

/** The member paused or asked to delete the account: renewal stops at the period end, no refund (IOS-H01 ruling) */
export const PRO_LEAVE_TITLE = "توقّف تجديد Pro";
export function proLeaveBody(reason: "paused" | "deletion", date: string): string {
  return reason === "paused"
    ? `أوقفت حسابك مؤقتاً، فأوقفنا تجديد اشتراك Pro دون استرداد. تبقى مزايا Pro حتى ${date}، ويمكنك متابعة الاشتراك من صفحة عضوية Pro بعد إعادة تفعيل حسابك.`
    : `طلبت حذف حسابك، فأوقفنا تجديد اشتراك Pro دون استرداد. تبقى مزايا Pro حتى ${date} ما لم يُحذف الحساب قبل ذلك.`;
}
