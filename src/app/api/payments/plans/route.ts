import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { countryConfig } from "@/lib/countries";
import { getVisitorCountry } from "@/lib/countries/server";
import { formatCharge, packagesFor } from "@/lib/payments/packages";

/** The packages of the member's country (a signed-out visitor: the country they chose) */
export async function GET() {
  const session = await auth();
  const user = session?.user?.id ? await db.user.findUnique({ where: { id: session.user.id }, select: { country: true } }) : null;
  const country = user?.country ?? (await getVisitorCountry());
  const cfg = countryConfig(country);
  return NextResponse.json({
    country: cfg.code,
    packages: packagesFor(cfg.code).map((p) => ({
      id: p.id,
      name: p.name,
      credits: p.credits,
      price: p.price,
      currency: p.currency,
      /** «د.أ» / «ر.س» */
      currencySymbol: cfg.currency.symbol,
      /** What the card is actually charged, when it differs from the display price (Jordan: USD) */
      ...(p.chargeCurrency === "usd" && { chargeUsd: p.chargeAmount / 100 }),
      chargeLabel: formatCharge(p),
      ...(p.popular && { popular: true }),
      /** Opening offer: the old price, shown struck through */
      ...(p.wasPrice && { wasPrice: p.wasPrice }),
    })),
  });
}
