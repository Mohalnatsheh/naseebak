"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { CompletenessResult } from "@/lib/profile-completeness";

/** The signed-in user as returned (JSON-serialised) by GET /api/profile */
export interface DashboardProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  status: string;
  isVerified: boolean;
  isDeactivated: boolean;
  matchCredits: number;
  createdAt: string;
  profile: ({ isComplete?: boolean } & Record<string, unknown>) | null;
  personalityResult: { personalityType: string | null; createdAt: string; updatedAt: string } | null;
  parentInfo: {
    id: string;
    parentName: string;
    relationship: string;
    address: string | null;
    shareConsentAt: string | null;
  } | null;
  identityDoc: { status: string } | null;
  photos: { id: string; url: string; order: number; isPrimary: boolean }[];
  _count: { receivedSuggestions: number; matchesAsFemale: number; matchesAsMale: number };
}

/** New-cycle badges from /api/me/counts */
export interface CycleCounts {
  flags: { introRequests: boolean; chat: boolean; mutualSuggestions: boolean; creditOnInterest?: boolean };
  pendingIntros: number;
  /** Match of the pending request that expires first, for the dashboard card link */
  pendingIntroMatchId?: string | null;
  unreadChats: number;
  hasChats: boolean;
  guardian: { exists: boolean; consented: boolean } | null;
  /** Matches where a family or chat request can still be sent (not blocked, partner active, not finished) */
  actionableMatches: number;
  /** credit_on_interest only: my balance ("مهتم" costs 1) */
  credits?: number;
}

const EMPTY_COUNTS: CycleCounts = {
  flags: { introRequests: false, chat: false, mutualSuggestions: false, creditOnInterest: false },
  pendingIntros: 0,
  unreadChats: 0,
  hasChats: false,
  guardian: null,
  actionableMatches: 0,
};

interface DashboardData {
  profile: DashboardProfile | null;
  completeness: CompletenessResult | null;
  unreadCount: number;
  counts: CycleCounts;
  /** True until both the profile and the first switch flags (/api/me/counts) have loaded,
   *  so switch-dependent UI never flashes the legacy flow first */
  loading: boolean;
  /** The last /api/profile load failed (network, server error, no user in the answer). The profile
   *  loaded before, if any, is kept; with none, pages show LoadError instead of "finish your setup" */
  profileFailed: boolean;
  refreshProfile: () => Promise<void>;
  refreshUnread: () => Promise<unknown>;
}

const DashboardContext = createContext<DashboardData>({
  profile: null,
  completeness: null,
  unreadCount: 0,
  counts: EMPTY_COUNTS,
  loading: true,
  profileFailed: false,
  refreshProfile: async () => {},
  refreshUnread: async () => {},
});

export function useDashboardData() {
  return useContext(DashboardContext);
}

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [counts, setCounts] = useState<CycleCounts>(EMPTY_COUNTS);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileFailed, setProfileFailed] = useState(false);
  const [countsReady, setCountsReady] = useState(false);
  const loading = profileLoading || !countsReady;

  const refreshProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error(`profile ${res.status}`);
      const data = await res.json();
      if (!data?.user) throw new Error("profile missing");
      setProfile(data.user);
      if (data.completeness) setCompleteness(data.completeness);
      setProfileFailed(false);
    } catch {
      // Keep whatever loaded before; never treat a failed load as an empty (incomplete) profile
      setProfileFailed(true);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refreshUnread = useCallback(async (): Promise<boolean> => {
    try {
      const [res, countsRes] = await Promise.all([
        fetch("/api/notifications/unread-count"),
        fetch("/api/me/counts"),
      ]);
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
      if (countsRes.ok) {
        setCounts({ ...EMPTY_COUNTS, ...(await countsRes.json()) });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    refreshProfile();
    // The first flags gate `loading`: retry once on a blip, then show the page anyway
    let retry: ReturnType<typeof setTimeout> | undefined;
    refreshUnread().then((ok) => {
      if (ok) return setCountsReady(true);
      retry = setTimeout(() => {
        refreshUnread().finally(() => setCountsReady(true));
      }, 2000);
    });

    // Only a tab the member is looking at polls: a background tab would keep them "recently seen"
    // (/api/me/counts touches lastActiveAt) and load the database for nothing. Back on the tab → refresh.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refreshUnread();
    }, 30000);
    function handleVisibility() {
      if (document.visibilityState === "visible") refreshUnread();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    function handleNotificationsRead() {
      refreshUnread();
    }
    window.addEventListener("naseeb:notifications-read", handleNotificationsRead);

    return () => {
      clearInterval(interval);
      if (retry) clearTimeout(retry);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("naseeb:notifications-read", handleNotificationsRead);
    };
  }, [refreshProfile, refreshUnread]);

  return (
    <DashboardContext.Provider value={{ profile, completeness, unreadCount, counts, loading, profileFailed, refreshProfile, refreshUnread }}>
      {children}
    </DashboardContext.Provider>
  );
}
