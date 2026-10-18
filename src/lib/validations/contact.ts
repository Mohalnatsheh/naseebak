import { z } from "zod/v4";
import { toLatinDigits } from "@/lib/digits";
import { jordanPhoneRegex } from "./auth";

const emailCheck = z.email();

/**
 * Public contact form. `website` is a honeypot: people never fill it, bots usually do.
 * Members sign up with a phone only, so an email OR a Jordanian mobile (or both) is enough.
 */
export const contactSchema = z
  .object({
    name: z.string().trim().min(2, "يرجى إدخال اسمك").max(80, "الاسم طويل جداً"),
    email: z
      .string()
      .trim()
      .max(120, "البريد الإلكتروني طويل جداً")
      .optional()
      .transform((v) => v ?? "")
      .refine((v) => v === "" || emailCheck.safeParse(v).success, "يرجى إدخال بريد إلكتروني صحيح"),
    phone: z
      .string()
      .optional()
      // Arabic keyboards type ٠٧٩…: convert first, like every phone field
      .transform((v) => toLatinDigits(v ?? "").replace(/[\s\-()]/g, ""))
      .refine((v) => v === "" || jordanPhoneRegex.test(v), "رقم الهاتف غير صالح. مثال: 0791234567"),
    subject: z.string().trim().min(2, "يرجى إدخال موضوع الرسالة").max(150, "الموضوع طويل جداً"),
    message: z.string().trim().min(10, "يرجى كتابة رسالة من 10 أحرف على الأقل").max(2000, "الرسالة طويلة جداً (2000 حرف كحد أقصى)"),
    website: z.string().max(0).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "يرجى إدخال رقم هاتفك أو بريدك الإلكتروني لنتمكن من الرد عليك" });
    }
  });

export type ContactInput = z.infer<typeof contactSchema>;
