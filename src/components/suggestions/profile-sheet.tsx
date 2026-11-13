"use client";

import type { ReactNode } from "react";
import { SheetTitle } from "@/components/ui/sheet";
import { DetailSheet } from "@/components/shared/detail-sheet";
import { MemberAvatar } from "@/components/shared/member-avatar";
import { ProBadge } from "@/components/shared/pro-badge";
import { WhyLine } from "@/components/shared/person-card";
import { CandidateDetails } from "@/components/suggestions/candidate-details";
import { useDashboardData } from "@/contexts/dashboard-context";
import { forPartner } from "@/lib/gendered-copy";
import type { FeedItem } from "@/lib/suggestions/feed-types";

/**
 * The whole profile of a suggested person in one scroll (home/suggestions redesign): a panel from the inline-end side
 * (the physical left in RTL) at 440 px on ≥ md, full-screen on phones. Nothing collapsed; the answers (`footer`) are
 * pinned at the bottom and the ⋮ menu (`menu`) sits in the header. Esc, ✕ and the browser's back button close it;
 * the focus returns to what opened it. No photo: the avatar stays locked until a mutual «مهتم».
 */
export function ProfileSheet({
  item,
  onClose,
  footer,
  menu,
  status,
}: {
  item: FeedItem | null;
  onClose: () => void;
  footer: ReactNode;
  menu?: ReactNode;
  status?: ReactNode;
}) {
  const { profile } = useDashboardData();

  if (!item) return null;
  const c = item.candidate;
  const gender = profile?.gender;
  const title = c.age ? `${c.firstName}، ${c.age}` : c.firstName;
  // A declined card shows no activity (like the card and the app)
  const activity = item.declined ? null : item.activity;
  const meta = [c.city, activity].filter(Boolean).join(" · ");
  const score = Math.round(item.compatibilityScore);

  return (
    <DetailSheet open onClose={onClose} title={title} menu={menu} footer={footer}>
      <div className="flex flex-col items-center gap-2 text-center">
        <MemberAvatar name={c.firstName} size={96} locked />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <SheetTitle className="font-display text-title">{title}</SheetTitle>
          {item.isPro && <ProBadge />}
        </div>
        <p className="text-label text-muted-foreground">
          {meta}
          {meta && score > 0 ? " · " : ""}
          {score > 0 && <span className="text-accent-ink">توافق {score}%</span>}
        </p>
        {status && <div className="flex flex-wrap items-center justify-center gap-1.5">{status}</div>}
        <p className="text-caption text-muted-foreground">الصور تظهر بعد التوافق المتبادل فقط</p>
      </div>

      <div className="mt-5 space-y-4">
        <WhyLine>{item.reason}</WhyLine>
        {c.aboutMe && (
          <section>
            <h3 className="mb-1.5 text-label font-bold text-foreground">{forPartner(gender, "عنه", "عنها")}</h3>
            <p className="whitespace-pre-line text-body text-ink">{c.aboutMe}</p>
          </section>
        )}
        <CandidateDetails c={c} flat />
      </div>
    </DetailSheet>
  );
}
