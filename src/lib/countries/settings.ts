/**
 * Admin-editable country settings (table `country_settings`, multi-country 2026-10-29), on top of the fixed facts in
 * `src/lib/countries/index.ts`. Server only (imports the database).
 *
 * Safe defaults when a country has no row: Jordan active and selling (today's live behaviour), every other country
 * inactive with purchases off — so deploying this code never opens a country by itself. Local development opens
 * Saudi Arabia with `node prisma/seed-countries.mjs --dev`.
 *
 * Provider secrets (Broadnet, Unifonic, Stripe) are only ever read from env; nothing here returns them.
 */
import type { CountrySetting, SmsProviderKind } from "@prisma/client";
import { db } from "@/lib/db";
import { COUNTRIES, COUNTRY_CODES, DEFAULT_COUNTRY, countryConfig, countryOfPhone, isCountryCode, type CountryCode } from "@/lib/countries";
import { PRICES_APPROVED, packagesFor } from "@/lib/payments/packages";
import { localizedPath } from "@/lib/site-paths";
import { areasFor, citiesFor } from "@/lib/countries/places";
import { HOUSING_TYPES, OPTION_VALUES, SKIN_COLORS, expenseRangesFor, incomeRangesFor, nationalityOptions, tribeLabel } from "@/lib/profile-options";
import { EDUCATION_ORDER } from "@/lib/matching/score";

export type CountrySettings = Omit<CountrySetting, "createdAt" | "updatedAt" | "updatedById">;
export type ResolvedSmsProvider = "BROADNET" | "UNIFONIC" | "MOCK" | "NONE";

const BASE: Omit<CountrySettings, "code" | "active" | "purchasesEnabled"> = {
  registrationOpen: true,
  smsProvider: "DEFAULT",
  smsSenderId: null,
  supportEmail: null,
  supportPhone: null,
  supportWhatsapp: null,
  seoTitle: null,
  seoDescription: null,
  heroTitle: null,
  heroSubtitle: null,
  pollsEnabled: true,
};

/** What a country without a row behaves like */
export function defaultCountrySettings(code: CountryCode): CountrySettings {
  const isDefault = code === DEFAULT_COUNTRY;
  return { ...BASE, code, active: isDefault, purchasesEnabled: isDefault };
}

/** The editable part of a row (drops timestamps and the editor id) */
function toSettings(r: CountrySetting): CountrySettings {
  return {
    code: r.code, active: r.active, registrationOpen: r.registrationOpen, purchasesEnabled: r.purchasesEnabled,
    smsProvider: r.smsProvider, smsSenderId: r.smsSenderId, supportEmail: r.supportEmail, supportPhone: r.supportPhone,
    supportWhatsapp: r.supportWhatsapp, seoTitle: r.seoTitle, seoDescription: r.seoDescription, heroTitle: r.heroTitle,
    heroSubtitle: r.heroSubtitle, pollsEnabled: r.pollsEnabled,
  };
}

const TTL = 30_000;
// One cache per server process, shared by every route (Next.js may give each route its own copy of this module,
// and an admin's save must clear the copy the public API reads too)
const store = globalThis as unknown as { __naseebakCountryCache?: { at: number; rows: Map<CountryCode, CountrySettings> } | null };

export function clearCountrySettingsCache() {
  store.__naseebakCountryCache = null;
}

async function loadAll(): Promise<Map<CountryCode, CountrySettings>> {
  const cache = store.__naseebakCountryCache;
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  const rows = new Map<CountryCode, CountrySettings>(COUNTRY_CODES.map((c) => [c, defaultCountrySettings(c)]));
  try {
    for (const r of await db.countrySetting.findMany()) {
      if (!isCountryCode(r.code)) continue;
      rows.set(r.code, toSettings(r));
    }
  } catch (error) {
    // Database trouble: fall back to the safe defaults rather than failing every page
    console.error("[countries] settings could not be read, using defaults:", error);
  }
  store.__naseebakCountryCache = { at: Date.now(), rows };
  return rows;
}

export async function getCountrySettings(code: CountryCode): Promise<CountrySettings> {
  return (await loadAll()).get(code) ?? defaultCountrySettings(code);
}

export async function listCountrySettings(): Promise<CountrySettings[]> {
  const all = await loadAll();
  return COUNTRY_CODES.map((c) => all.get(c) ?? defaultCountrySettings(c));
}

export async function activeCountryCodes(): Promise<CountryCode[]> {
  return (await listCountrySettings()).filter((s) => s.active).map((s) => s.code as CountryCode);
}

/**
 * Mock SMS may be used only in development, or in a local production build (`next start` on this machine): never on
 * a server whose public address is not localhost. Production (naseebak.com) can never reach the mock.
 */
export function mockSmsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return true;
  const url = env.NEXT_PUBLIC_APP_URL ?? "";
  return env.SMS_MOCK === "true" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
}

/** The provider a country's SMS go through, after DEFAULT and the dev-only mock switch are resolved */
export function resolveSmsProvider(code: CountryCode, setting: SmsProviderKind, env: NodeJS.ProcessEnv = process.env): ResolvedSmsProvider {
  // Local runs: SMS_MOCK=true sends every SMS to the mock outbox, whatever the country is set to
  if (env.SMS_MOCK === "true" && mockSmsAllowed(env)) return "MOCK";
  if (setting === "MOCK") return mockSmsAllowed(env) ? "MOCK" : "NONE";
  if (setting === "DEFAULT") return code === "SA" ? "UNIFONIC" : "BROADNET";
  return setting;
}

/** Whether a provider's env credentials are present (never their values) */
export function providerConfigured(provider: ResolvedSmsProvider, env: NodeJS.ProcessEnv = process.env): boolean {
  switch (provider) {
    case "BROADNET":
      return !!env.BROADNET_USER && !!env.BROADNET_PASS;
    case "UNIFONIC":
      return !!env.UNIFONIC_APP_SID && !!env.UNIFONIC_SENDER_ID;
    case "MOCK":
      return true;
    case "NONE":
      return false;
  }
}

/** Purchases are on only when the admin enabled them AND the country's prices are approved in code */
export function purchasesAvailable(s: CountrySettings): boolean {
  return s.active && s.purchasesEnabled && PRICES_APPROVED[s.code as CountryCode] === true && packagesFor(s.code).length > 0;
}

export interface CountryWarning {
  level: "error" | "warning";
  message: string;
}

/** What is missing or risky in a country's setup (admin page) */
export function countryWarnings(s: CountrySettings, env: NodeJS.ProcessEnv = process.env): CountryWarning[] {
  const code = s.code as CountryCode;
  const out: CountryWarning[] = [];
  const provider = resolveSmsProvider(code, s.smsProvider, env);
  if (s.active && s.registrationOpen && provider === "NONE") {
    out.push({ level: "error", message: "Registration is open but no SMS provider is set: sign-up codes will fail (only test numbers work)." });
  }
  if (provider !== "NONE" && provider !== "MOCK" && !providerConfigured(provider, env)) {
    out.push({
      level: s.active ? "error" : "warning",
      message: provider === "BROADNET" ? "Broadnet credentials are missing (BROADNET_USER / BROADNET_PASS)." : "Unifonic credentials are missing (UNIFONIC_APP_SID / UNIFONIC_SENDER_ID).",
    });
  }
  if (s.smsProvider === "MOCK" && env.NODE_ENV === "production" && !mockSmsAllowed(env)) {
    out.push({ level: "error", message: "Mock SMS is set but is refused on this server: no SMS will be sent." });
  }
  if (s.purchasesEnabled && PRICES_APPROVED[code] !== true) {
    out.push({ level: "warning", message: `Purchases are switched on but ${countryConfig(code).nameEn} prices are not approved in code (src/lib/payments/packages.ts): nothing is sold.` });
  }
  if (s.purchasesEnabled && !env.STRIPE_SECRET_KEY) {
    out.push({ level: "warning", message: "STRIPE_SECRET_KEY is not set: checkout cannot start." });
  }
  if (s.active && !s.supportEmail && !s.supportPhone && !s.supportWhatsapp) {
    out.push({ level: "warning", message: "No support contact for this country." });
  }
  if (!s.active && code === DEFAULT_COUNTRY) {
    out.push({ level: "error", message: "The default country is inactive: new visitors have no country to register in." });
  }
  return out;
}

/** Safe, public view of a country (country list and the mobile app). Never secrets or provider details. */
export function publicCountry(s: CountrySettings) {
  const code = s.code as CountryCode;
  const c = COUNTRIES[code];
  return {
    code,
    name: { ar: c.name, en: c.nameEn },
    inName: c.inName,
    flag: { emoji: c.flag, id: code.toLowerCase() },
    dialCode: `+${c.dialCode}`,
    phone: { placeholder: c.phone.placeholder, example: c.phone.example, nationalPattern: c.phone.national.source },
    currency: { code: c.currency.code, symbol: c.currency.symbol },
    locales: ["ar"],
    defaultLocale: "ar",
    direction: "rtl" as const,
    timeZone: c.timeZone,
    dateLocale: c.dateLocale,
    isDefault: code === DEFAULT_COUNTRY,
    active: s.active,
    registrationOpen: s.active && s.registrationOpen,
    purchasesEnabled: purchasesAvailable(s),
    features: { polls: s.pollsEnabled },
    words: c.words,
  };
}

/** Public detail of one country: the list fields plus page content, support and legal links */
export function publicCountryDetail(s: CountrySettings, content: { heroTitle: string; heroSubtitle: string; seoTitle: string; seoDescription: string }, siteUrl: string) {
  const code = s.code as CountryCode;
  const abs = (p: string) => `${siteUrl.replace(/\/$/, "")}${localizedPath(p, code)}`;
  return {
    ...publicCountry(s),
    content: {
      heroTitle: s.heroTitle || content.heroTitle,
      heroSubtitle: s.heroSubtitle || content.heroSubtitle,
      seoTitle: s.seoTitle || content.seoTitle,
      seoDescription: s.seoDescription || content.seoDescription,
    },
    support: { email: s.supportEmail, phone: s.supportPhone, whatsapp: s.supportWhatsapp },
    links: {
      home: abs("/"),
      terms: abs("/terms"),
      privacy: abs("/privacy"),
      refundPolicy: abs("/refund-policy"),
      faq: abs("/faq"),
      contact: abs("/contact"),
      register: `${siteUrl.replace(/\/$/, "")}/register?country=${code.toLowerCase()}`,
    },
    // The choices the web setup wizard offers for this country (the app must not keep its own copies)
    lists: {
      cities: citiesFor(code),
      areas: areasFor(code),
      nationalities: { male: nationalityOptions("MALE", code), female: nationalityOptions("FEMALE", code) },
      incomeRanges: incomeRangesFor(code),
      expenseRanges: expenseRangesFor(code),
      tribeLabel: tribeLabel(code),
    },
    // Fixed option values of the profile forms (stored as is; the app shows them with its own gendered labels)
    options: {
      education: EDUCATION_ORDER,
      job: OPTION_VALUES.job,
      maritalStatus: OPTION_VALUES.maritalStatus,
      religiosity: OPTION_VALUES.religiosity,
      smokingStatus: OPTION_VALUES.smokingStatus,
      cookingAbility: OPTION_VALUES.cookingAbility,
      lifestyle: OPTION_VALUES.lifestyle,
      skinColor: SKIN_COLORS,
      housingType: HOUSING_TYPES,
    },
  };
}

/**
 * Sign-up gate by the number's country: inactive or closed countries take no new members (existing members can still
 * sign in). Returns an Arabic message to show, or null when sign-up is allowed. An optional `claimed` country (sent by
 * the app or the dial-code switch) must be the number's own country.
 */
export async function countrySignupBlock(
  phone: string,
  claimed?: string | null,
): Promise<{ status: number; error: string; code: string } | null> {
  const country = countryOfPhone(phone);
  if (!country) return { status: 400, error: "رقم الهاتف غير مدعوم", code: "COUNTRY_UNSUPPORTED" };
  if (claimed && claimed.toUpperCase() !== country) {
    return { status: 400, error: "رقم الهاتف لا يتبع الدولة المختارة", code: "COUNTRY_MISMATCH" };
  }
  const s = await getCountrySettings(country);
  if (!s.active) return { status: 403, error: "نصيبك غير متاح في هذه الدولة حالياً", code: "COUNTRY_INACTIVE" };
  if (!s.registrationOpen) return { status: 403, error: "التسجيل مغلق حالياً في هذه الدولة", code: "COUNTRY_REGISTRATION_CLOSED" };
  return null;
}
