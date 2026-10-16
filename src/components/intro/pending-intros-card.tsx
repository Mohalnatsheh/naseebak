"use client";

import Link from "next/link";
import { Inbox, ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/contexts/dashboard-context";

/** Dashboard nudge: introduction requests waiting for my answer. */
export function PendingIntrosCard() {
  const { counts } = useDashboardData();
  const n = counts.pendingIntros;
  if (!counts.flags.introRequests || n <= 0) return null;

  return (
    <Link
      href={counts.pendingIntroMatchId ? `/dashboard/matches?match=${counts.pendingIntroMatchId}` : "/dashboard/matches"}
      className="block"
    >
      <Card className="group overflow-hidden border-accent/40 bg-gradient-to-l from-accent/15 via-accent/5 to-transparent shadow-md transition-all duration-300 hover:shadow-lg">
        <CardContent className="flex items-center gap-3 pt-5 pb-4 sm:gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-md">
            <Inbox className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground text-sm sm:text-base">
              {n === 1
                ? "لديك طلب تعارف بانتظار ردك"
                : n === 2
                  ? "لديك طلبا تعارف بانتظار ردك"
                  : `لديك ${n} طلبات تعارف بانتظار ردك`}
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              الطلبات تنتهي بعد ٧ أيام من إرسالها.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
            {n === 1 ? "عرض الطلب" : "عرض الطلبات"}
            <ChevronLeft className="h-4 w-4" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
