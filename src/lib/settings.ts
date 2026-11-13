import { db } from "@/lib/db";
import { DEFAULT_OFFER_TITLE, offerOpenAt, parseOfferDate, parseOfferPercent, type ActiveOffer, type OfferSettings } from "@/lib/payments/offer";

const DEFAULTS: Record<string, string> = {
  registration_open: "true",
  maintenance_mode: "false",
  maintenance_message: "",
  intro_requests_enabled: "false",
  chat_enabled: "false",
  new_suggestions_flow: "false",
  credit_on_interest: "false",
  // «جديدة» order: people active today first, people with 5+ «مهتم» waiting on them last (2026-11-07)
  feed_active_first: "false",
  // Saudi Arabia while it is small (2026-11-08): no score minimum for Saudi members. «شروط أساسية» still apply
  sa_relaxed_matching: "false",
  // Lebanon, same as Saudi Arabia (2026-11-10): no score minimum for Lebanese members. «شروط أساسية» still apply
  lb_relaxed_matching: "false",
  // Answering a «مهتم» with «مهتم» costs no credit; the first «مهتم» still does (2026-11-08)
  free_interest_reply: "false",
  // At 0 credits «مهتم» stays tappable and opens the «انتهى رصيدك» step, for members who can buy (2026-11-11)
  interest_paywall: "false",
  // Pro membership: gates new sales and offers only, never what a member already paid for
  pro_enabled: "false",
  // Pro members delete a message or clear a chat (hidden from members, never erased)
  chat_delete_enabled: "false",
  // «الديانة» field: asked, shown and stored only while on. The pair rule in matching applies either way
  religion_enabled: "false",
  // Jordan charged in JOD instead of USD for new purchases (2026-11-11). Open checkouts and Pro subscriptions keep theirs
  jod_charging: "false",
  // Sale offer (2026-11-13): +percent% credits on purchases and the first Pro payment inside the window. 0 = off
  offer_bonus_percent: "0",
  offer_starts_at: "",
  offer_ends_at: "",
  offer_title: "",
  engagement_polls_enabled: "false",
  poll_round_days: "3",
  poll_reward_credits: "1",
  // Notice SMS (match, interest, reminders, chat). Off since 2026-10-29 (owner): SMS only for sign-in codes
  sms_notices_enabled: "false",
  // Arabic payment page (Stripe Payment Element on naseebak.com/pay) instead of Stripe Checkout: off | test | all
  arabic_checkout: "off",
};

const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds

export async function getSetting(key: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }

  try {
    const row = await db.systemSetting.findUnique({ where: { key } });
    const value = row?.value ?? DEFAULTS[key] ?? "";
    cache.set(key, { value, expiresAt: now + CACHE_TTL });
    return value;
  } catch {
    return DEFAULTS[key] ?? "";
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  cache.delete(key);
}

export async function isRegistrationOpen(): Promise<boolean> {
  const value = await getSetting("registration_open");
  return value === "true";
}

/** Maintenance mode: public/user pages show a maintenance screen (admins still see the site). */
export async function getMaintenanceState(): Promise<{ enabled: boolean; message: string }> {
  const [enabled, message] = await Promise.all([
    getSetting("maintenance_mode"),
    getSetting("maintenance_message"),
  ]);
  return { enabled: enabled === "true", message };
}

export interface CycleFlags {
  /** Family/chat requests on matches; credits are spent per request instead of per suggestion */
  introRequests: boolean;
  /** In-app chat — only on when intro requests are on too */
  chat: boolean;
  /** Simultaneous suggestions (both decide on the same row) — only on when intro requests are on too */
  mutualSuggestions: boolean;
  /** "Interested" costs 1 credit, suggestions and requests are free — only on when simultaneous suggestions are on too */
  creditOnInterest: boolean;
  /** Finer activity groups (today first) and busy people last in «جديدة» — only on when simultaneous suggestions are on too */
  activeFirstFeed?: boolean;
  /** Answering «مهتم» on a card the other side already said «مهتم» on costs no credit — only on with credit on interest */
  freeInterestReply?: boolean;
  /** Countries whose members are suggested without the score minimum (switches `sa_relaxed_matching`, `lb_relaxed_matching`). «شروط أساسية» still apply */
  relaxedCountries?: string[];
}

/** Pro chat delete switch (`chat_delete_enabled`, Admin → Settings). Default off */
export async function getChatDeleteEnabled(): Promise<boolean> {
  return (await getSetting("chat_delete_enabled")) === "true";
}

/** «الديانة» question switch (`religion_enabled`, Admin → Settings). Default off: nothing asked, shown or stored */
export async function getReligionEnabled(): Promise<boolean> {
  return (await getSetting("religion_enabled")) === "true";
}

/** Whether a new purchase by a member of this country is charged in JOD (switch `jod_charging`, Jordan only) */
export async function jodChargingFor(country: string | null | undefined): Promise<boolean> {
  return country === "JO" && (await getSetting("jod_charging")) === "true";
}

/** Pro membership sales switch (Admin → Settings). Default off. Never gates existing subscriptions */
/** Sale offer (lib/payments/offer): percent 0 = off. Admin → Settings */
export async function getOfferSettings(): Promise<OfferSettings> {
  const [percent, startsAt, endsAt, title] = await Promise.all([
    getSetting("offer_bonus_percent"),
    getSetting("offer_starts_at"),
    getSetting("offer_ends_at"),
    getSetting("offer_title"),
  ]);
  return {
    percent: parseOfferPercent(percent),
    startsAt: parseOfferDate(startsAt),
    endsAt: parseOfferDate(endsAt),
    title: title.trim() || DEFAULT_OFFER_TITLE,
  };
}

/** The offer open now for a member whose country is selling (`purchasesAvailable`), else null */
export async function activeOfferFor(selling: boolean, now: Date = new Date()): Promise<ActiveOffer | null> {
  if (!selling) return null;
  const s = await getOfferSettings();
  if (!offerOpenAt(s, now)) return null;
  return { percent: s.percent, title: s.title, endsAt: s.endsAt!.toISOString() };
}

export async function getProEnabled(): Promise<boolean> {
  return (await getSetting("pro_enabled")) === "true";
}

/** New user cycle switches (Admin → Settings). Both default to off. */
export async function getCycleFlags(): Promise<CycleFlags> {
  const [intro, chat, mutual, creditOnInterest, activeFirst, saRelaxed, freeReply, lbRelaxed] = await Promise.all([
    getSetting("intro_requests_enabled"),
    getSetting("chat_enabled"),
    getSetting("new_suggestions_flow"),
    getSetting("credit_on_interest"),
    getSetting("feed_active_first"),
    getSetting("sa_relaxed_matching"),
    getSetting("free_interest_reply"),
    getSetting("lb_relaxed_matching"),
  ]);
  const introRequests = intro === "true";
  const mutualSuggestions = introRequests && mutual === "true";
  const creditOn = mutualSuggestions && creditOnInterest === "true";
  return {
    introRequests,
    chat: introRequests && chat === "true",
    mutualSuggestions,
    creditOnInterest: creditOn,
    freeInterestReply: creditOn && freeReply === "true",
    activeFirstFeed: mutualSuggestions && activeFirst === "true",
    relaxedCountries: [...(saRelaxed === "true" ? ["SA"] : []), ...(lbRelaxed === "true" ? ["LB"] : [])],
  };
}
