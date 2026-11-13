import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { countryConfig } from "@/lib/countries";
import { getVisitorCountry } from "@/lib/countries/server";
import { formatCharge, packagesFor } from "@/lib/payments/packages";
import {
  getCountrySettings,
  purchasesAvailable,
} from "@/lib/countries/settings";
import { activeOfferFor, jodChargingFor } from "@/lib/settings";
import { bonusFor, offerPackageName } from "@/lib/payments/offer";

/** The packages of the member's country (a signed-out visitor: the country they chose) */
export async function GET() {
  const session = await currentSession();
  const user = session?.user?.id
    ? await db.user.findUnique({
        where: { id: session.user.id },
        select: { country: true },
      })
    : null;
  const country = user?.country ?? (await getVisitorCountry());
  const cfg = countryConfig(country);
  const settings = await getCountrySettings(cfg.code);
  const purchasesEnabled = purchasesAvailable(settings);
  const jod = await jodChargingFor(cfg.code);
  // Sale offer (lib/payments/offer): only where buying is open. Older apps show `name` as sent, so the gift goes in it
  const offer = await activeOfferFor(purchasesEnabled);
  return NextResponse.json({
    country: cfg.code,
    /** False while the country is not selling (not active, switched off, or prices not approved) */
    purchasesEnabled,
    /** Jordan is charged in JOD (switch jod_charging): the page says so instead of the dollar note */
    jodCharging: jod,
    /** The sale offer open now ({ percent, title, endsAt }), or null */
    offer,
    packages: packagesFor(cfg.code, settings.packagePrices, jod).map((p) => {
      const bonus = offer ? bonusFor(p.credits, offer.percent) : 0;
      return {
        id: p.id,
        name: bonus > 0 ? offerPackageName(p.name, bonus) : p.name,
        /** Extra credits from the sale offer; `credits` stays the package's own */
        ...(bonus > 0 && { bonusCredits: bonus }),
        credits: p.credits,
        price: p.price,
        currency: p.currency,
        /** «د.أ» / «ر.س» */
        currencySymbol: cfg.currency.symbol,
        /** What the card is actually charged, when it differs from the display price (Jordan before jod_charging: USD) */
        ...(p.chargeCurrency === "usd" &&
          p.currency !== "USD" && { chargeUsd: p.chargeAmount / 100 }),
        /** «4.23$», or the price itself («3 د.أ») when charged as shown: the app hides it then */
        chargeLabel: formatCharge(p),
        ...(p.popular && { popular: true }),
        /** Opening offer: the old price, shown struck through */
        ...(p.wasPrice && { wasPrice: p.wasPrice }),
      };
    }),
  });
}
