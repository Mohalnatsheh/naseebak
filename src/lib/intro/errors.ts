import { isTestPhone } from "@/lib/test-accounts";

/** Rule violations from intro requests and chat, mapped to an HTTP status and an Arabic message. */
export type IntroErrorCode =
  | "NOT_FOUND"
  | "DISABLED"
  | "BLOCKED"
  | "NO_CREDITS"
  | "DUPLICATE"
  | "NOT_ALLOWED"
  | "GUARDIAN_REQUIRED"
  | "CONSENT_REQUIRED"
  | "EXPIRED"
  | "RATE_LIMITED"
  | "FILTERED"
  | "PREFERENCE_REQUIRED"
  | "PRO_REQUIRED"
  | "MEDIA_INVALID";

const DEFAULTS: Record<IntroErrorCode, { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: "غير موجود" },
  DISABLED: { status: 404, message: "هذه الميزة غير متاحة حالياً" },
  BLOCKED: { status: 403, message: "لا يمكن إتمام هذا الإجراء" },
  NO_CREDITS: { status: 402, message: "رصيدك غير كافٍ. يمكنك شحن رصيدك للمتابعة." },
  DUPLICATE: { status: 409, message: "لديك طلب قيد الانتظار بالفعل" },
  NOT_ALLOWED: { status: 409, message: "لا يمكن إرسال هذا الطلب الآن" },
  GUARDIAN_REQUIRED: { status: 412, message: "يلزم إضافة بيانات وليّ الأمر في ملفك الشخصي أولاً" },
  CONSENT_REQUIRED: { status: 412, message: "يلزم موافقتك على مشاركة بيانات وليّ الأمر" },
  EXPIRED: { status: 410, message: "انتهت صلاحية هذا الطلب" },
  RATE_LIMITED: { status: 429, message: "رسائل كثيرة في وقت قصير. يمكنك المحاولة بعد قليل." },
  FILTERED: { status: 422, message: "لا يمكن إرسال هذه الرسالة" },
  PREFERENCE_REQUIRED: { status: 400, message: "يلزم اختيار طريقة التعارف: محادثة أو تعارف عائلي" },
  PRO_REQUIRED: { status: 403, message: "إرسال الصور والرسائل الصوتية متاح لأعضاء Pro" },
  MEDIA_INVALID: { status: 422, message: "لا يمكن إرسال هذا الملف" },
};

/** NO_CREDITS for test accounts (the store review login): the app never shows payments to them, so no «اشحن» */
export const NO_CREDITS_NEUTRAL_MESSAGE = "رصيدك لا يكفي لهذه الخطوة.";

export class IntroError extends Error {
  readonly code: IntroErrorCode;
  readonly status: number;

  constructor(code: IntroErrorCode, message?: string) {
    super(message ?? DEFAULTS[code].message);
    this.name = "IntroError";
    this.code = code;
    this.status = DEFAULTS[code].status;
  }
}

/** NO_CREDITS worded for the member: website wording, or the neutral one (no recharge) for a test account. */
export function noCreditsError(phone: string | null | undefined): IntroError {
  return new IntroError("NO_CREDITS", isTestPhone(phone) ? NO_CREDITS_NEUTRAL_MESSAGE : undefined);
}
