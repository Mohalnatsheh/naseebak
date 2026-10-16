"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

/** New-cycle badges from /api/me/counts */
export interface CycleCounts {
  flags: { introRequests: boolean; chat: boolean };
  pendingIntros: number;
  unreadChats: number;
  hasChats: boolean;
  guardian: { exists: boolean; consented: boolean } | null;
}

const EMPTY_COUNTS: CycleCounts = {
  flags: { introRequests: false, chat: false },
  pendingIntros: 0,
  unreadChats: 0,
  hasChats: false,
  guardian: null,
};

interface DashboardData {
  profile: any;
  completeness: any;
  unreadCount: number;
  counts: CycleCounts;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  refreshUnread: () => Promise<void>;
}

const DashboardContext = createContext<DashboardData>({
  profile: null,
  completeness: null,
  unreadCount: 0,
  counts: EMPTY_COUNTS,
  loading: true,
  refreshProfile: async () => {},
  refreshUnread: async () => {},
});

export function useDashboardData() {
  return useContext(DashboardContext);
}

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<any>(null);
  const [completeness, setCompleteness] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [counts, setCounts] = useState<CycleCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      setProfile(data.user ?? null);
      if (data.completeness) setCompleteness(data.completeness);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const [res, countsRes] = await Promise.all([
        fetch("/api/notifications/unread-count"),
        fetch("/api/me/counts"),
      ]);
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
      if (countsRes.ok) setCounts(await countsRes.json());
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    refreshProfile();
    refreshUnread();

    const interval = setInterval(refreshUnread, 30000);

    function handleNotificationsRead() {
      refreshUnread();
    }
    window.addEventListener("naseeb:notifications-read", handleNotificationsRead);

    return () => {
      clearInterval(interval);
      window.removeEventListener("naseeb:notifications-read", handleNotificationsRead);
    };
  }, [refreshProfile, refreshUnread]);

  return (
    <DashboardContext.Provider value={{ profile, completeness, unreadCount, counts, loading, refreshProfile, refreshUnread }}>
      {children}
    </DashboardContext.Provider>
  );
}
