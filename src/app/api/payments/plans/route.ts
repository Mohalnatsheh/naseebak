import { NextResponse } from "next/server";
import { CREDIT_PACKAGES } from "@/lib/payments/packages";

export async function GET() {
  return NextResponse.json({
    packages: CREDIT_PACKAGES.map((p) => ({
      id: p.id,
      name: p.name,
      credits: p.credits,
      price: p.priceJod,
      currency: "JOD",
      /** What the card is actually charged (Stripe, USD) */
      chargeUsd: p.priceUsdCents / 100,
      ...(p.popular && { popular: true }),
    })),
  });
}
