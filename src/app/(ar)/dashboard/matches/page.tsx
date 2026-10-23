"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-context";
import { MatchesView } from "@/components/matches/matches-view";

/**
 * Mutual matches live in the «توافق متبادل» tab of /dashboard/suggestions (owner decision 2026-10-23:
 * every match in one place). This route stays for old links and notifications (`?match=<id>` is kept).
 * With shared suggestions off, the matches page is shown on its own as before.
 */
export default function MatchesPage() {
  const router = useRouter();
  const { counts, loading } = useDashboardData();
  const merged = counts.flags.mutualSuggestions;

  useEffect(() => {
    if (loading || !merged) return;
    const match = new URLSearchParams(window.location.search).get("match");
    router.replace(`/dashboard/suggestions?tab=matches${match ? `&match=${encodeURIComponent(match)}` : ""}`);
  }, [loading, merged, router]);

  if (loading || merged) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  return <MatchesView />;
}
