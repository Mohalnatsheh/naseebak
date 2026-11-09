"use client";

import { useDashboardData } from "@/contexts/dashboard-context";

/** The signed-in member's gender for copy (masculine until the profile loads, as forViewer does) */
export function useViewerFemale(): boolean {
  return useDashboardData().profile?.gender === "FEMALE";
}

/** One word or phrase in the member's gender, inside JSX text (QA WA-11): <V m="اضغط" f="اضغطي" /> */
export function V({ m, f }: { m: string; f: string }) {
  return <>{useViewerFemale() ? f : m}</>;
}
