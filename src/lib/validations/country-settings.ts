import { z } from "zod/v4";
import { isCountryCode, type CountryCode } from "@/lib/countries";

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

const MAX_ADMIN_EMAILS = 10;

/** «a@x.co, b@x.co» → the addresses, without blanks or repeats */
export function parseEmailList(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  return (value ?? "").split(/[,،;]/).map((s) => s.trim()).filter((email) => {
    const key = email.toLowerCase();
    if (!email || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const emailList = z
  .string()
  .transform((s, ctx) => {
    const emails = parseEmailList(s);
    const bad = emails.find((email) => !z.email().safeParse(email).success);
    if (bad) ctx.addIssue({ code: "custom", message: `Not a valid email: ${bad}` });
    if (emails.length > MAX_ADMIN_EMAILS) ctx.addIssue({ code: "custom", message: `At most ${MAX_ADMIN_EMAILS} admin emails` });
    return emails.join(", ") || null;
  })
  .nullable()
  .optional();

/** A package price: what Stripe can charge, with at most two decimals */
const packagePrice = z
  .number("Enter a price for every package")
  .min(1, "A package price must be at least 1")
  .max(9999, "A package price must be under 10,000")
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "A price can have at most two decimals");

/** One Pro plan: a plan that is saved has a real price (readProPlans drops the rest), credits 0 to 100 */
const proPlan = z
  .object({
    enabled: z.boolean("Pro plan: enabled must be on or off"),
    price: z
      .number("Enter a price for every Pro plan")
      .gt(0, "A Pro plan price must be above 0")
      .max(9999, "A Pro plan price must be under 10,000")
      .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "A price can have at most two decimals"),
    credits: z.number("Enter the credits of every Pro plan").int("Pro credits must be a whole number").min(0, "Pro credits can't be negative").max(100, "Pro credits are at most 100"),
  })
  .strict();

const proPlansSchema = z.object({ weekly: proPlan.optional(), monthly: proPlan.optional(), yearly: proPlan.optional() }).strict();

/** Stripe's smallest charge as a Pro plan price, per country */
const PRO_MIN_PRICE: Record<CountryCode, [number, string]> = {
  JO: [0.36, "A Jordan Pro plan price must be at least 0.36 JOD"],
  SA: [2, "A Saudi Pro plan price must be at least 2 SAR"],
  LB: [0.5, "A Lebanon Pro plan price must be at least 0.5 USD"],
};

const PLAN_NAMES: Record<string, string> = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

/**
 * Every problem with a country's Pro plans, named by plan («Monthly: A Pro plan price must be above 0 · Yearly: …»), or null.
 * The same rules as the server, so Admin → Countries says it before the confirmation dialog (QA WEB-PAY-10):
 * the schema above, and Stripe's smallest charge (Saudi Arabia: 2 SAR; Jordan, charged in dollars: 0.36 JOD; Lebanon: 0.5 USD).
 */
export function proPlansError(plans: unknown, code: string): string | null {
  if (plans == null) return null;
  const parsed = proPlansSchema.safeParse(plans);
  if (!parsed.success) {
    // Every invalid field, by plan, so the admin fixes them in one go (WP2-13)
    const lines = parsed.error.issues.map((issue) => {
      const plan = PLAN_NAMES[String(issue?.path?.[0] ?? "")];
      return `${plan ? `${plan}: ` : ""}${issue?.message ?? "Invalid Pro plans"}`;
    });
    return [...new Set(lines)].join(" · ");
  }
  const priced = Object.entries(parsed.data).filter(([, p]) => p) as [string, { price: number }][];
  const under = (min: number) => priced.filter(([, p]) => p.price < min).map(([id]) => PLAN_NAMES[id] ?? id);
  // Saudi: Stripe's 2 SAR minimum. Jordan is charged in dollars (dinar × 1.41): below 0.36 JOD is under 0.50 USD
  // Lebanon is charged in dollars as shown: Stripe's 0.50 USD minimum
  const [min, label] = isCountryCode(code) ? PRO_MIN_PRICE[code] : [0, ""];
  const low = min ? under(min) : [];
  if (low.length === 1 && priced.length === 1) return label;
  return low.length ? `${label} (${low.join(", ")})` : null;
}

/** Admin → Countries: one country's editable settings (every field optional; unknown fields refused) */
export const countrySettingsSchema = z
  .object({
    active: z.boolean().optional(),
    registrationOpen: z.boolean().optional(),
    purchasesEnabled: z.boolean().optional(),
    pollsEnabled: z.boolean().optional(),
    packagePrices: z.record(z.string(), packagePrice).optional(),
    pricesApproved: z.boolean().optional(),
    /** Pro membership plans of this country; a plan left out is not offered */
    proPlans: proPlansSchema.optional(),
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
    adminEmails: emailList,
    supportPhone: phoneLike,
    supportWhatsapp: phoneLike,
    seoTitle: optionalText(70),
    seoDescription: optionalText(170),
    heroTitle: optionalText(80),
    heroSubtitle: optionalText(300),
  })
  .strict();

export type CountrySettingsInput = z.infer<typeof countrySettingsSchema>;
