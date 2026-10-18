"use client";

import { Phone, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GuardianContact } from "@/lib/intro/requests";
import { RELATIONSHIP_LABELS, formatJordanPhone } from "./intro-utils";

/** Shown to both sides after an accepted family introduction. */
export function GuardianContactCard({ contact, partnerName }: { contact?: GuardianContact; partnerName: string }) {
  if (!contact) {
    return (
      <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 p-4 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
        تم قبول التعارف العائلي. ستظهر بيانات وليّ الأمر هنا فور توفرها.
      </div>
    );
  }

  const phone = formatJordanPhone(contact.phone);
  return (
    <div className="rounded-2xl border border-emerald-200/60 bg-gradient-to-l from-emerald-50/80 to-card p-4 md:p-5 dark:from-emerald-950/20">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
        <ShieldCheck className="h-4 w-4" />
        بيانات وليّ أمر {partnerName}
      </div>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card border border-emerald-200/60">
            <UserRound className="h-6 w-6 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <p className="font-bold text-foreground">{contact.name}</p>
            <p className="text-sm text-muted-foreground">
              {RELATIONSHIP_LABELS[contact.relationship] ?? contact.relationship} ·{" "}
              <span dir="ltr" className="font-medium text-foreground/80">{phone.display}</span>
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button asChild className="h-11 flex-1 sm:flex-none gap-1.5">
            <a href={`tel:${phone.tel}`}>
              <Phone className="h-4 w-4" />
              اتصال
            </a>
          </Button>
          <Button asChild variant="outline" className="h-11 flex-1 sm:flex-none gap-1.5 border-emerald-300/70 text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300">
            <a href={`https://wa.me/${phone.wa}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" />
              واتساب
            </a>
          </Button>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        ننصح أن يتواصل وليّ أمرك مباشرة مع وليّ أمر الطرف الآخر لترتيب موعد الزيارة العائلية.
      </p>
    </div>
  );
}
