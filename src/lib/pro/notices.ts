/** Texts of Pro notices shared by several modules (db-free, so no module cycle between the webhook and manage code) */
export const PRO_ENDED_TITLE = "انتهت عضوية Pro";
export const PRO_ENDED_BODY = "يمكنك الاشتراك في Pro من جديد في أي وقت من صفحة عضوية Pro.";
/** A renewal payment failed: there is no card update here (Stripe retries), so say what happens and what can be done */
export const PRO_FAILED_TITLE = "تعذّر تجديد اشتراك Pro";
export const PRO_FAILED_BODY = "سنحاول الدفع مرة أخرى خلال الأيام القادمة. إن انتهت العضوية يمكنك الاشتراك من جديد ببطاقة أخرى من صفحة عضوية Pro.";
/** A paid Pro invoice that did not make Pro live (QA WEB-PAY-05): the member hears it, an admin decides on a refund */
export const PRO_NOT_LIVE_TITLE = "دفعة Pro إضافية";
export const PRO_DUPLICATE_BODY = "وصلتنا دفعة لاشتراك Pro ثانٍ بينما اشتراكك فعّال، فأوقفنا الاشتراك الثاني. سيراجع فريق نصيبك هذه الدفعة ويُعلمك بقرار استردادها.";
export const PRO_AFTER_END_BODY = "وصلتنا دفعة تجديد بعد انتهاء عضوية Pro، ولم تُستأنف العضوية. سيراجع فريق نصيبك هذه الدفعة ويُعلمك بقرار استردادها.";

/** The member paused or asked to delete the account: renewal stops at the period end, no refund (IOS-H01 ruling) */
export const PRO_LEAVE_TITLE = "توقّف تجديد Pro";
export function proLeaveBody(reason: "paused" | "deletion", date: string): string {
  return reason === "paused"
    ? `أوقفت حسابك مؤقتاً، فأوقفنا تجديد اشتراك Pro دون استرداد. تبقى مزايا Pro حتى ${date}، ويمكنك متابعة الاشتراك من صفحة عضوية Pro بعد إعادة تفعيل حسابك.`
    : `طلبت حذف حسابك، فأوقفنا تجديد اشتراك Pro دون استرداد. تبقى مزايا Pro حتى ${date} ما لم يُحذف الحساب قبل ذلك.`;
}
