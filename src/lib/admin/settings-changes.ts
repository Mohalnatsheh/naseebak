/**
 * What an admin is about to change, in plain words, for the confirmation before saving
 * (Settings → Mobile app, Countries). Pure functions: nothing here saves or decides anything.
 */

export interface ChangeSummary {
  /** One line per changed value, «Arabic payment page: Off → Everyone» */
  lines: string[];
  /** Strong warnings: what members lose because of this change */
  warnings: string[];
}

const onOff = (v: boolean) => (v ? "On" : "Off");
const shown = (v: string | null | undefined) => (v ?? "").trim() || "(empty)";
const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim() === (b ?? "").trim();

/* ---------- Settings → Mobile app ---------- */

export interface MobilePlatformValues {
  minVersion: string;
  latestVersion: string;
  storeUrl: string;
}

export interface MobileAppValues {
  android: MobilePlatformValues;
  ios: MobilePlatformValues;
  paymentsEnabled: boolean;
  androidCertSha256: string;
  arabicCheckout?: string;
}

const ARABIC_LABELS: Record<string, string> = { off: "Off", test: "Test accounts only", all: "Everyone" };
const arabicLabel = (v: string | undefined) => ARABIC_LABELS[v ?? "off"] ?? v ?? "Off";

/** The server stores the fingerprints uppercase, one list: compare them the same way */
const fingerprints = (v: string) => v.split(/[\s,]+/).map((f) => f.trim().toUpperCase()).filter(Boolean).join(",");

export function mobileAppChanges(before: MobileAppValues, after: MobileAppValues): ChangeSummary {
  const lines: string[] = [];
  const warnings: string[] = [];

  // One switch for both platforms (mobile_payments_enabled)
  if (before.paymentsEnabled !== after.paymentsEnabled) {
    lines.push(`App payments (Android and iOS): ${onOff(before.paymentsEnabled)} → ${onOff(after.paymentsEnabled)}`);
    if (!after.paymentsEnabled) warnings.push("Members can no longer buy credits in the app. They keep their balance and can still buy on the website.");
  }
  if ((before.arabicCheckout ?? "off") !== (after.arabicCheckout ?? "off")) {
    lines.push(`Arabic payment page: ${arabicLabel(before.arabicCheckout)} → ${arabicLabel(after.arabicCheckout)}`);
    if (after.arabicCheckout === "all") warnings.push("Every member pays on the Arabic page, on the website and in the app. Make sure it was tried with a test account first.");
  }

  for (const [key, name] of [["android", "Android"], ["ios", "iOS"]] as const) {
    const b = before[key];
    const a = after[key];
    if (!same(b.minVersion, a.minVersion)) {
      lines.push(`${name} required update: ${shown(b.minVersion)} → ${shown(a.minVersion)}`);
      if (a.minVersion.trim()) warnings.push(`${name} apps older than ${a.minVersion.trim()} are blocked until the member updates.`);
    }
    if (!same(b.latestVersion, a.latestVersion)) lines.push(`${name} optional update: ${shown(b.latestVersion)} → ${shown(a.latestVersion)}`);
    if (!same(b.storeUrl, a.storeUrl)) lines.push(`${name} store link: ${shown(b.storeUrl)} → ${shown(a.storeUrl)}`);
  }

  if (fingerprints(before.androidCertSha256) !== fingerprints(after.androidCertSha256)) lines.push("Android signing fingerprints changed");
  return { lines, warnings };
}

/* ---------- Countries ---------- */

export interface CountryValues {
  active: boolean;
  registrationOpen: boolean;
  purchasesEnabled: boolean;
  pollsEnabled: boolean;
  smsProvider: string;
  smsSenderId: string | null;
  adminEmails?: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  supportWhatsapp: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  packagePrices?: Record<string, number> | null;
  pricesApproved?: boolean | null;
  proPlans?: Record<string, { enabled: boolean; price: number; credits: number }> | null;
}

const PRO_PLAN_NAMES: [string, string][] = [["weekly", "Weekly"], ["monthly", "Monthly"], ["yearly", "Yearly"]];
const proText = (p?: { enabled: boolean; price: number; credits: number }) =>
  p ? `${p.enabled ? "on" : "off"}, ${p.price}, ${p.credits} credits` : "not offered";

const COUNTRY_SWITCHES: [keyof CountryValues, string][] = [
  ["active", "Active"],
  ["registrationOpen", "Registration open"],
  ["purchasesEnabled", "Sell credit packages"],
  ["pollsEnabled", "«سؤال نصيبك»"],
];

const COUNTRY_TEXTS: [keyof CountryValues, string][] = [
  ["heroTitle", "Landing headline"],
  ["heroSubtitle", "Landing sub-headline"],
  ["seoTitle", "SEO title"],
  ["seoDescription", "SEO description"],
  ["adminEmails", "Admin emails"],
  ["supportEmail", "Support email"],
  ["supportPhone", "Support phone"],
  ["supportWhatsapp", "Support WhatsApp"],
  ["smsSenderId", "SMS sender id"],
];

const NO_REAL_SMS = ["NONE", "MOCK"];

/** `packages` = the country's packages at their current prices, `approved` = whether those are approved now */
export function countryChanges(
  before: CountryValues,
  after: CountryValues,
  country: string,
  packages: { id: string; credits: number; price: number; currency: string }[] = [],
  approved = false,
): ChangeSummary {
  const lines: string[] = [];
  const warnings: string[] = [];

  for (const [key, label] of COUNTRY_SWITCHES) {
    if (before[key] !== after[key]) lines.push(`${label}: ${onOff(!!before[key])} → ${onOff(!!after[key])}`);
  }
  if (before.smsProvider !== after.smsProvider) lines.push(`SMS provider: ${before.smsProvider} → ${after.smsProvider}`);
  for (const [key, label] of COUNTRY_TEXTS) {
    const b = before[key] as string | null;
    const a = after[key] as string | null;
    if (!same(b, a)) lines.push(`${label}: ${shown(b)} → ${shown(a)}`);
  }

  for (const p of packages) {
    const price = after.packagePrices?.[p.id];
    if (price === undefined || price === p.price) continue;
    lines.push(`${p.credits} credits: ${p.price} → ${price} ${p.currency}`);
    if (price >= p.price * 2 || price <= p.price / 2) {
      warnings.push(`${p.credits} credits in ${country} goes from ${p.price} to ${price} ${p.currency}. Check the amount.`);
    }
  }
  for (const [id, name] of PRO_PLAN_NAMES) {
    const b = before.proPlans?.[id];
    const a = after.proPlans?.[id];
    if (proText(b) !== proText(a)) lines.push(`Pro ${name}: ${proText(b)} → ${proText(a)}`);
  }
  const approvedAfter = after.pricesApproved ?? approved;
  if (approvedAfter !== approved) lines.push(`Prices approved: ${onOff(approved)} → ${onOff(approvedAfter)}`);

  if (before.smsProvider !== after.smsProvider && NO_REAL_SMS.includes(after.smsProvider)) {
    warnings.push(`Nobody in ${country} will be able to sign in: sign-in codes go by SMS, and ${after.smsProvider} sends none to real numbers.`);
  }
  if (before.active && !after.active) {
    warnings.push(`${country} becomes inactive: hidden from visitors and in the app, no new sign-ups, nothing sold. Existing members can still sign in.`);
  }
  if (before.registrationOpen && !after.registrationOpen) {
    warnings.push(`New members in ${country} can no longer sign up. Existing members can still sign in.`);
  }
  if ((before.purchasesEnabled && !after.purchasesEnabled) || (approved && !approvedAfter && after.purchasesEnabled)) {
    warnings.push(`Selling stops in ${country}: members there can't buy credits on the website or in the app.`);
  }
  return { lines, warnings };
}
