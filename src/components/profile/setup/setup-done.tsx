"use client";

import Link from "next/link";
import { Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { forViewer } from "@/lib/gendered-copy";
import { isEmptyStored } from "@/lib/profile-edit-split";

type Values = Record<string, unknown>;

/** The partner preferences beyond the (required) age range */
const OPTIONAL_PREFS = ["prefCity", "prefEducation", "prefMaritalStatus", "prefHijab", "prefBeard", "prefReligiosity", "prefSect", "prefSmokingStatus", "prefChildrenAcceptance"];

/**
 * Edit-list rows (`EDIT_SECTIONS` keys) and the photos page: the optional rest of the profile. `missing`: whether
 * the row is still to do (the setup never adds photos, so that row always shows).
 */
const LATER: { label: string; note?: string; href: string; missing: (p: Values) => boolean }[] = [
  { label: "نبذة عنك", href: "/dashboard/profile/edit?field=aboutMe", missing: (p) => isEmptyStored(p.aboutMe) },
  { label: "الوظيفة والطول", href: "/dashboard/profile/edit?field=job", missing: (p) => isEmptyStored(p.job) || isEmptyStored(p.height) },
  { label: "صوري", note: "مخفية حتى التوافق المتبادل", href: "/dashboard/photos", missing: () => true },
  // The website has no separate preferences page: the edit list opens on the preferences
  { label: "تفضيلات الشريك", href: "/dashboard/profile/edit?field=prefAgeMin", missing: (p) => OPTIONAL_PREFS.every((k) => isEmptyStored(p[k])) },
];

/**
 * «ملفك جاهز»: the end of the setup, straight to the suggestions, with what is still empty as a list. `profile`: the
 * saved answers (absent: every row shows).
 */
export function SetupDone({ gender, profile }: { gender: string; profile?: Values }) {
  const rows = profile ? LATER.filter((row) => row.missing(profile)) : LATER;
  return (
    <div className="mx-auto max-w-md py-6">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
        <Check className="size-8" strokeWidth={3} aria-hidden />
      </div>
      <h1 className="text-center font-display text-display-sm text-ink">ملفك جاهز</h1>
      <p className="mt-1 mb-6 text-center text-body text-muted-ink">
        {forViewer(gender, "نبحث الآن عمّن يناسبك. ستجد اقتراحاتك في «الاقتراحات».", "نبحث الآن عمّن يناسبكِ. ستجدين اقتراحاتكِ في «الاقتراحات».")}
      </p>
      <Button asChild size="lg" className="h-12 w-full text-body">
        <Link href="/dashboard/suggestions">عرض الاقتراحات</Link>
      </Button>

      {rows.length > 0 && (
        <>
          <h2 className="mt-8 mb-1.5 px-1 text-label font-normal text-muted-ink">
            {forViewer(gender, "أكمل ملفك متى شئت · يزيد فرصك", "أكملي ملفكِ متى شئتِ · يزيد فرصكِ")}
          </h2>
          <ul className="overflow-hidden rounded-xl bg-card">
            {rows.map((row, i) => (
              <li key={row.href} className={i > 0 ? "border-t border-border" : undefined}>
                <Link
                  href={row.href}
                  className="flex min-h-13 items-center gap-3 px-4 py-2 text-body text-ink transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    {row.label}
                    {row.note && <span className="block text-caption text-muted-ink">{row.note}</span>}
                  </span>
                  <span className="text-label text-accent-ink">إضافة</span>
                  <ChevronLeft className="size-4 shrink-0 text-muted-ink" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
