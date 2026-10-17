import { z } from "zod/v4";

/** Public contact form. `website` is a honeypot: people never fill it, bots usually do. */
export const contactSchema = z.object({
  name: z.string().trim().min(2, "يرجى إدخال اسمك").max(80, "الاسم طويل جداً"),
  email: z.string().trim().email("يرجى إدخال بريد إلكتروني صحيح").max(120, "البريد الإلكتروني طويل جداً"),
  subject: z.string().trim().min(2, "يرجى إدخال موضوع الرسالة").max(150, "الموضوع طويل جداً"),
  message: z.string().trim().min(10, "يرجى كتابة رسالة من 10 أحرف على الأقل").max(2000, "الرسالة طويلة جداً (2000 حرف كحد أقصى)"),
  website: z.string().max(0).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;
