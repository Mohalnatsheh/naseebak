"use client";

import { Gift } from "lucide-react";
import { formatDate } from "@/lib/countries";
import type { ActiveOffer } from "@/lib/payments/offer";

/**
 * Sale offer banner (lib/payments/offer) on the payments page and the Pro page. `variant="pro"` says the bonus comes
 * with the first payment only. The end is shown in the member's country date style and time zone.
 */
export function OfferBanner({ offer, variant = "credits", country = "JO" }: { offer: ActiveOffer | null; variant?: "credits" | "pro"; country?: string }) {
  if (!offer) return null;
  // The last moment of the offer (ends exactly at midnight → the day before)
  const lastDay = formatDate(new Date(new Date(offer.endsAt).getTime() - 1), country, { day: "numeric", month: "long" });
  const where = variant === "pro" ? "عند أول دفعة اشتراك في Pro" : "عند شراء أي باقة أو الاشتراك في Pro";
  return (
    <section
      aria-label={offer.title}
      className="landing-night relative overflow-hidden rounded-2xl px-4 py-4 text-white shadow-md shadow-primary/15 sm:px-6"
    >
      <div className="landing-khatam absolute inset-0" aria-hidden />
      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground" aria-hidden>
          <Gift className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg leading-tight text-accent sm:text-xl">{offer.title}</h2>
          <p className="mt-0.5 text-sm text-white/85">
            رصيد إضافي بنسبة <span className="font-bold tabular-nums">{offer.percent}%</span> {where}.
          </p>
          <p className="mt-0.5 text-caption text-white/70">ينتهي العرض {lastDay}</p>
        </div>
      </div>
    </section>
  );
}
