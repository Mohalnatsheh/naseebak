/**
 * The contact form's and the guardian form's rules without zod (QA WC-19 / WA-10): the client pages check
 * here first so the zod chunk (~260 KB) never loads for them; the API routes keep the zod schemas
 * (`contactSchemaFor`, `parentInfoSchemaFor`), which say the same thing. A test keeps both in step.
 */
import { toLatinDigits } from "@/lib/digits";
import { isValidPhone } from "@/lib/phone";
import { COUNTRIES, DEFAULT_COUNTRY, countryConfig, type CountryCode } from "@/lib/countries";

export type FieldIssue = { field: string; message: string };

/** zod's own email pattern (zod/v4 `z.email()`), so the page and the API agree */
const EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** First problem with a contact form, in field order (null = fine). Mirrors `contactSchemaFor` */
export function contactFormIssue(
  v: { name?: string; email?: string; phone?: string; subject?: string; message?: string; website?: string },
  country: CountryCode = DEFAULT_COUNTRY,
): FieldIssue | null {
  const cfg = COUNTRIES[country];
  const phoneWord = `ال${cfg.words.phone}`;
  const yourPhone = `${cfg.words.phone}ك`;
  const name = (v.name ?? "").trim();
  if (name.length < 2) return { field: "name", message: "يرجى إدخال اسمك" };
  if (name.length > 80) return { field: "name", message: "الاسم طويل جداً" };
  const email = (v.email ?? "").trim();
  if (email.length > 120) return { field: "email", message: "البريد الإلكتروني طويل جداً" };
  if (email && !EMAIL_RE.test(email)) return { field: "email", message: "يرجى إدخال بريد إلكتروني صحيح" };
  const phone = toLatinDigits(v.phone ?? "").replace(/[\s\-()]/g, "");
  if (phone && !isValidPhone(phone, country)) return { field: "phone", message: `رقم ${phoneWord} غير صالح. مثال: ${cfg.phone.example}` };
  const subject = (v.subject ?? "").trim();
  if (subject.length < 2) return { field: "subject", message: "يرجى إدخال موضوع الرسالة" };
  if (subject.length > 150) return { field: "subject", message: "الموضوع طويل جداً" };
  const message = (v.message ?? "").trim();
  if (message.length < 10) return { field: "message", message: "يرجى كتابة رسالة من 10 أحرف على الأقل" };
  if (message.length > 2000) return { field: "message", message: "الرسالة طويلة جداً (2000 حرف كحد أقصى)" };
  if ((v.website ?? "").length > 0) return { field: "website", message: "بيانات غير صالحة" };
  if (!email && !phone) return { field: "phone", message: `يرجى إدخال رقم ${yourPhone} أو بريدك الإلكتروني لنتمكن من الرد عليك` };
  return null;
}

export type GuardianFormKey = "parentName" | "parentPhone" | "relationship" | "address";

/** Every problem with the guardian quick form, one per field. Mirrors `parentInfoSchemaFor` */
export function guardianFormIssues(
  v: Record<GuardianFormKey, string>,
  country: unknown,
): Partial<Record<GuardianFormKey, string>> {
  const c = countryConfig(country);
  const out: Partial<Record<GuardianFormKey, string>> = {};
  const name = v.parentName.trim();
  if (name.length < 2) out.parentName = "اسم ولي الأمر مطلوب";
  else if (name.length > 80) out.parentName = "اسم ولي الأمر طويل جداً";
  else if (!/^[؀-ۿ\s]+$/.test(name)) out.parentName = "يرجى كتابة اسم ولي الأمر باللغة العربية";
  const phone = toLatinDigits(v.parentPhone).replace(/[\s\-()]/g, "");
  // Empty is «مطلوب», not «غير صالح» (QA WM-10)
  if (!phone) out.parentPhone = `رقم ${c.words.phone} ولي الأمر مطلوب`;
  else if (!isValidPhone(phone, c.code)) out.parentPhone = `رقم ${c.words.phone} ولي الأمر غير صالح. مثال: ${c.phone.example}`;
  if (!["father", "mother", "brother", "guardian"].includes(v.relationship)) out.relationship = "صلة القرابة مطلوبة";
  const address = v.address.trim();
  // Optional (owner, 2026-11-13)
  if (address.length > 300) out.address = "العنوان طويل جداً";
  return out;
}
