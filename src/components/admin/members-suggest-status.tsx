"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fmtAgo, fmtDate, fmtDateTime } from "@/components/admin/admin-list-bits";
import type { MemberSuggestStatus, NoSuggestionsReason } from "@/lib/admin/members-suggest-reason";

/** JSON of `GET /api/admin/users/[id]/suggest-status` */
type Status = Omit<MemberSuggestStatus, "lastActiveAt" | "nextSuggestionsAt"> & {
  lastActiveAt: string | null;
  nextSuggestionsAt: string | null;
};

export const REASON_LABEL: Record<NoSuggestionsReason, string> = {
  not_a_member: "This is an admin account",
  deactivated: "The account is deactivated",
  suspended: "The account is suspended",
  flagged: "Flagged: no new automatic suggestions until the flag is cleared",
  engaged: "Told us an introduction ended in an engagement",
  idle: "Away 7+ days: suggestions resume when they come back",
  setup_unfinished: "Profile setup is not finished",
  no_credits: "0 credits (legacy flow: each suggestion uses a credit)",
  weekly_cap: "Reached the weekly limit of free suggestions",
  no_candidates: "No suitable person right now (same country, active in the last 2 weeks, score, dealbreakers, not met before)",
  ready: "Suitable people exist: cards are created the next time the member opens the site or app",
};

function reasonText(s: Status): string {
  if (s.reason === "ready") return `${REASON_LABEL.ready} (${s.candidates} found)`;
  if (s.reason === "weekly_cap" && s.nextSuggestionsAt) return `${REASON_LABEL.weekly_cap}: next on ${fmtDate(s.nextSuggestionsAt)}`;
  return s.reason ? REASON_LABEL[s.reason] : "";
}

/** Top of the member page: the figures support needs first, and why the member has no cards */
export function MembersSuggestStatus({ userId, credits }: { userId: string; credits: number }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/users/${userId}/suggest-status`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data: Status = await res.json();
        if (!cancelled) setStatus(data);
      })
      .catch((err) => {
        console.error(err);
        if (cancelled) return;
        setFailed(true);
        toast.error("Could not load the member's suggestion status");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const tiles = [
    { label: "Last active", value: status ? fmtAgo(status.lastActiveAt) : "…", title: status ? fmtDateTime(status.lastActiveAt) : undefined },
    { label: "Credits", value: String(credits) },
    { label: "Open suggestions", value: status ? String(status.openSuggestions) : "…" },
    { label: "Open «مهتم»", value: status ? String(status.openInterests) : "…", title: "Waiting for the other side's answer" },
  ];

  return (
    <Card className="py-4">
      <CardContent className="space-y-3 px-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="min-w-0 rounded-lg border border-border/60 p-3" title={t.title}>
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className="truncate font-semibold">{t.value}</p>
            </div>
          ))}
        </div>
        {failed && <p className="text-sm text-destructive">Could not load the suggestion status.</p>}
        {status?.reason && (
          <p className="flex items-start gap-2 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span className="min-w-0"><span className="font-medium">No suggestions:</span> {reasonText(status)}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
