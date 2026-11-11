"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { CompletenessResult } from "@/lib/profile-completeness";
import { COUNTRIES, toCountry, type CountryCode, type CountryConfig } from "@/lib/countries";
import { sharedGet } from "@/lib/shared-get";

/** The signed-in user as returned (JSON-serialised) by GET /api/profile */
export interface DashboardProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  /** Account country (JO / SA) — wording, places, money and dates follow it */
  country?: string;
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
  flags: { introRequests: boolean; chat: boolean; mutualSuggestions: boolean; creditOnInterest?: boolean; freeInterestReply?: boolean };
  pendingIntros: number;
  /** Match of the pending request that expires first, for the dashboard card link */
  pendingIntroMatchId?: string | null;
  unreadChats: number;
  hasChats: boolean;
  guardian: { exists: boolean; consented: boolean } | null;
  /** Matches where a family or chat request can still be sent (not blocked, partner active, not finished) */
  actionableMatches: number;
  /** Matches not closed (blocked, ended, finished, engaged); absent while the intro switch is off */
  openMatches?: number;
  /** credit_on_interest only: my balance ("مهتم" costs 1) */
  credits?: number;
  /** Shared suggestions only: cards nobody answered yet («الجديد») */
  newSuggestions?: number;
  /** Shared suggestions only: the other side said «مهتم», I haven't decided («مهتمون بالتحدث معك») */
  likedYou?: number;
  /** At 0 credits «مهتم» opens the «انتهى رصيدك» step instead of being greyed (switch interest_paywall, can buy) */
  interestPaywall?: boolean;
  /** My own Pro state, for the badge (independent of the `pro_enabled` switch). `showPage`: link the Pro page
   * (plans I can buy right now, or my subscription) */
  pro?: { isPro: boolean; cancelAtPeriodEnd: boolean; showPage?: boolean };
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
  /** The member's country (JO until the profile has loaded): wording, places, money and dates follow it */
  country: CountryCode;
  /** True until both the profile and the first switch flags (/api/me/counts) have loaded,
   *  so switch-dependent UI never flashes the legacy flow first */
  loading: boolean;
  /** The last /api/profile load failed (network, server error, no user in the answer). The profile
   *  loaded before, if any, is kept; with none, pages show LoadError instead of "finish your setup" */
  profileFailed: boolean;
  /** /api/me/counts never loaded (first load and its retry failed): `counts` holds the switches-off defaults, so
   *  switch-dependent pages show LoadError instead of the legacy flow (QA WA-02). Later poll failures keep the last
   *  counts and leave this false */
  countsFailed: boolean;
  refreshProfile: () => Promise<void>;
  refreshUnread: () => Promise<unknown>;
}

const DashboardContext = createContext<DashboardData>({
  profile: null,
  completeness: null,
  unreadCount: 0,
  counts: EMPTY_COUNTS,
  country: "JO",
  loading: true,
  profileFailed: false,
  countsFailed: false,
  refreshProfile: async () => {},
  refreshUnread: async () => {},
});

export function useDashboardData() {
  return useContext(DashboardContext);
}

/** The member's country config (COUNTRIES[country]): words, phone, currency, dates */
export function useCountry(): CountryConfig {
  return COUNTRIES[toCountry(useContext(DashboardContext).country)];
}

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [counts, setCounts] = useState<CycleCounts>(EMPTY_COUNTS);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileFailed, setProfileFailed] = useState(false);
  const [countsReady, setCountsReady] = useState(false);
  const [countsLoaded, setCountsLoaded] = useState(false);
  const loading = profileLoading || !countsReady;

  const refreshProfile = useCallback(async () => {
    try {
      const res = await sharedGet("/api/profile");
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

  const applyCounts = useCallback(async (countsRes: Response): Promise<boolean> => {
    if (!countsRes.ok) return false;
    const next = (await countsRes.json()) as Partial<CycleCounts>;
    // The Pro lookup failed on the server (no `pro` in the answer): keep the badge as it was, never hide it
    setCounts((prev) => ({ ...EMPTY_COUNTS, ...next, pro: next.pro ?? prev.pro }));
    setCountsLoaded(true);
    return true;
  }, []);

  /** Bell count and badges. Shared GETs (PA-M6): a page loading at the same moment rides on the same request */
  const refreshUnread = useCallback(async (): Promise<boolean> => {
    try {
      const [res, countsRes] = await Promise.all([
        sharedGet("/api/notifications/unread-count"),
        sharedGet("/api/me/counts"),
      ]);
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
      return await applyCounts(countsRes);
    } catch {
      return false;
    }
  }, [applyCounts]);

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

    // Reads come in bursts (the page's read-for-page, then the chat's read): one refresh for the lot. A read call that
    // answered the bell count sets it at once, and only the badges are fetched again (PA-M6)
    let readTimer: ReturnType<typeof setTimeout> | undefined;
    function handleNotificationsRead(event: Event) {
      const told = (event as CustomEvent<{ unreadCount?: number } | undefined>).detail?.unreadCount;
      if (typeof told === "number") setUnreadCount(told);
      if (readTimer) clearTimeout(readTimer);
      readTimer = setTimeout(() => {
        readTimer = undefined;
        if (typeof told === "number") void sharedGet("/api/me/counts").then(applyCounts).catch(() => {});
        else void refreshUnread();
      }, 300);
    }
    window.addEventListener("naseeb:notifications-read", handleNotificationsRead);

    return () => {
      clearInterval(interval);
      if (retry) clearTimeout(retry);
      if (readTimer) clearTimeout(readTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("naseeb:notifications-read", handleNotificationsRead);
    };
  }, [refreshProfile, refreshUnread, applyCounts]);

  return (
    <DashboardContext.Provider value={{ profile, completeness, unreadCount, counts, country: toCountry(profile?.country), loading, profileFailed, countsFailed: countsReady && !countsLoaded, refreshProfile, refreshUnread }}>
      {children}
    </DashboardContext.Provider>
  );
}
