import { z } from "zod/v4";

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `At most ${max} characters`)
    .transform((s) => s.trim() || null)
    .nullable()
    .optional();

const phoneLike = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().regex(/^(\+?[0-9 ]{6,20})?$/, "Digits only, e.g. +962 7 9123 4567"))
  .transform((s) => s || null)
  .nullable()
  .optional();

/** Admin → Countries: one country's editable settings (every field optional; unknown fields refused) */
export const countrySettingsSchema = z
  .object({
    active: z.boolean().optional(),
    registrationOpen: z.boolean().optional(),
    purchasesEnabled: z.boolean().optional(),
    pollsEnabled: z.boolean().optional(),
    smsProvider: z.enum(["DEFAULT", "BROADNET", "UNIFONIC", "MOCK", "NONE"]).optional(),
    /** SMS sender name: letters, digits, space . _ - (operators allow up to 11) */
    smsSenderId: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().regex(/^[A-Za-z0-9 ._-]{0,11}$/, "Sender id: up to 11 letters or digits"))
      .transform((s) => s || null)
      .nullable()
      .optional(),
    supportEmail: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.union([z.literal(""), z.email("Enter a valid email")]))
      .transform((s) => s || null)
      .nullable()
      .optional(),
    supportPhone: phoneLike,
    supportWhatsapp: phoneLike,
    seoTitle: optionalText(70),
    seoDescription: optionalText(170),
    heroTitle: optionalText(80),
    heroSubtitle: optionalText(300),
  })
  .strict();

export type CountrySettingsInput = z.infer<typeof countrySettingsSchema>;
