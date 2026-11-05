/**
 * What a Stripe checkout shows the member (owner request 2026-11-05). The Stripe account is shared and registered as
 * «LOGIC CENTER FOR WEBSITE DESIGN» (statement «LOGICCR», no logo), so the hosted page the app opens showed that name
 * and a dollar price — 0 of 13 app checkouts were ever paid. Each session now carries Naseebak's name, logo and colour,
 * an Arabic line with the dinar price and the dollar charge, an Arabic product name and «NASEEBAK» on the bank
 * statement. Stripe Checkout has no Arabic page language, so the rest of the page follows the browser (`auto`).
 * Checked on a live (unpaid, expired) session 2026-11-05: logo, Arabic product name and the Arabic line render right;
 * the browser tab title and the Link box still show the account's legal name — only the Stripe dashboard changes those.
 * Applies to the app's hosted page and the website's embedded form alike.
 */
import type Stripe from "stripe";
import { countryConfig, toCountry } from "@/lib/countries";
import { formatCharge, type CreditPackage } from "@/lib/payments/packages";

const SITE = "https://naseebak.com";
/** Shown after the account's own prefix on the bank statement: «LOGICCR* NASEEBAK» */
export const STATEMENT_SUFFIX = "NASEEBAK";

/** «3 د.أ» / «30 ر.س» */
export function displayPrice(pkg: Pick<CreditPackage, "price" | "country">): string {
  return `${pkg.price.toLocaleString("en-US")} ${countryConfig(toCountry(pkg.country)).currency.symbol}`;
}

/** Unicode isolates: Stripe's page is left-to-right, so the Arabic line is one right-to-left block (RLI…PDI) and
 * its Latin parts are left-to-right islands (LRI…PDI) — without them the word order came out scrambled */
const RLI = "\u2067";
const LRI = "\u2066";
const PDI = "\u2069";
const ltr = (s: string) => `${LRI}${s}${PDI}`;

/** The Arabic line above the pay button */
export function checkoutMessage(pkg: Pick<CreditPackage, "price" | "country" | "chargeCurrency" | "chargeAmount" | "name">): string {
  const price = displayPrice(pkg);
  const charged = pkg.chargeCurrency === "usd" ? `، تُخصم ${ltr(formatCharge(pkg))} بالدولار` : "";
  // The package's own name («10 أرصدة», «25 رصيداً»): already in correct Arabic
  return `${RLI}أنت تدفع لـ «نصيبك»: ${pkg.name} مقابل ${price}${charged}. يظهر في كشف البنك باسم ${ltr("LOGICCR* NASEEBAK")}.${PDI}`;
}

/** The extra session fields (spread into checkout.sessions.create) */
export function checkoutPresentation(
  pkg: Pick<CreditPackage, "price" | "country" | "chargeCurrency" | "chargeAmount" | "name">,
): Pick<Stripe.Checkout.SessionCreateParams, "branding_settings" | "custom_text" | "payment_intent_data"> {
  // Payment methods stay as set in the Stripe dashboard. Its «Link» box («Pay securely at LOGIC CENTER FOR WEBSITE
  // DESIGN») is a dashboard setting: limiting the session to cards did not remove it (checked live 2026-11-05)
  return {
    branding_settings: {
      display_name: "نصيبك (Naseebak)",
      button_color: "#22476a",
      border_style: "rounded",
      icon: { type: "url", url: `${SITE}/images/icon-512.png` },
      logo: { type: "url", url: `${SITE}/images/logo-full.png` },
    },
    custom_text: { submit: { message: checkoutMessage(pkg) } },
    payment_intent_data: {
      statement_descriptor_suffix: STATEMENT_SUFFIX,
      description: `نصيبك · ${pkg.name}`,
    },
  };
}

/** The Arabic product line on the checkout («نصيبك · 10 أرصدة») */
export function productName(pkg: Pick<CreditPackage, "name">): string {
  return `نصيبك · ${pkg.name}`;
}

/** A Stripe refusal caused by one of the presentation fields: the session is created again without them */
export function isPresentationError(error: unknown): boolean {
  const e = error as { type?: string; param?: string } | null;
  return (
    e?.type === "StripeInvalidRequestError" &&
    typeof e.param === "string" &&
    /^(branding_settings|custom_text|payment_intent_data\[(statement_descriptor_suffix|description)\])/.test(e.param)
  );
}
