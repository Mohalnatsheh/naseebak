"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboardData } from "@/contexts/dashboard-context";
import { toCountry, type CountryCode } from "@/lib/countries";
import { editField, rowKeyOf } from "@/lib/profile-edit-fields";
import {
  DEALBREAKERS_KEY,
  dealbreakerKeysToSave,
  planSave,
  runSave,
  saveSummary,
  sendableChanges,
  type SaveApi,
  type SavePlan,
} from "@/lib/profile-edit-state";
import type { DealbreakerPrefs } from "@/lib/matching/dealbreaker-summary";
import { sharedGet } from "@/lib/shared-get";

type Gender = "MALE" | "FEMALE";
type Values = Record<string, unknown>;

export interface EditSaveOutcome {
  /** The one banner line (`saveSummary`) */
  summary: string;
  /** Something failed: the banner reads as a warning */
  partial: boolean;
}

const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Today's calls, one per step of `runSave` */
const SAVE_API: SaveApi = {
  postPrefs: (prefs) => fetch("/api/profile/update-request", { method: "POST", ...json({ changes: prefs }) }),
  putDealbreakers: (keys) => fetch("/api/profile/dealbreakers", { method: "PUT", ...json({ keys }) }),
  putProfile: (body) => fetch("/api/profile", { method: "PUT", ...json(body) }),
  postReview: (changes, message) =>
    fetch("/api/profile/update-request", { method: "POST", ...json(message ? { changes, message } : { changes }) }),
};

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * One edit session of the profile edit list (`auth_profile_redesign`): the stored profile and the pending review
 * request, the unsaved changes on top, and one «حفظ» through `sendableChanges` → `planSave` → `runSave`.
 *
 * - A failed load sets `status: "failed"`: nothing is editable and nothing can be saved.
 * - `changes` may hold a value equal to the stored one (a row set back): `planSave` and `rowState` ignore it.
 * - After a save the rows that failed keep their changes; the rest reload from the server.
 * - `showDealbreakers`: the «شرط أساسي» toggles are shown (new suggestions flow), so their changes are saved.
 */
export function useEditSession({ religionEnabled, showDealbreakers }: { religionEnabled: boolean; showDealbreakers: boolean }) {
  const router = useRouter();
  const { refreshProfile } = useDashboardData();
  const [status, setStatus] = useState<"loading" | "failed" | "ready">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [stored, setStored] = useState<Values>({});
  const [gender, setGender] = useState<Gender>("MALE");
  const [country, setCountry] = useState<CountryCode>("JO");
  const [changes, setChangesState] = useState<Values>({});
  const [storedDealbreakers, setStoredDealbreakers] = useState<string[]>([]);
  const [dealbreakers, setDealbreakers] = useState<string[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Values | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<EditSaveOutcome | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  const toSetup = useEffectEvent(() => router.replace("/dashboard/profile/setup"));

  /** Reads the stored profile and the pending request. `keep`: the dealbreaker ticks survive (their save failed) */
  const load = useCallback(async (keep?: { dealbreakers: boolean }): Promise<"setup" | void> => {
    try {
      const [profileRes, requestsRes] = await Promise.all([sharedGet("/api/profile"), fetch("/api/profile/update-request")]);
      // A missed pending request would let a second one through (the server answers 409): both must load
      if (!profileRes.ok) throw new Error(`profile ${profileRes.status}`);
      if (!requestsRes.ok) throw new Error(`update requests ${requestsRes.status}`);
      const profileData = await profileRes.json();
      const requestsData = await requestsRes.json();
      const user = profileData.user;
      // Setup not finished: the setup saves each answer directly (as the legacy edit page)
      if (!user?.profile?.isComplete) return "setup";
      const p = user.profile as Values;
      const pending = (requestsData.requests as { status: string; changes?: Values }[] | undefined)?.find((r) => r.status === "PENDING");
      setGender(user.gender === "FEMALE" ? "FEMALE" : "MALE");
      setCountry(toCountry(user.country));
      setStored(p);
      setPendingChanges(pending ? (pending.changes ?? {}) : null);
      const db = listOf(p.dealbreakers);
      setStoredDealbreakers(db);
      if (!keep?.dealbreakers) setDealbreakers(db);
      setStatus("ready");
    } catch {
      setStatus("failed");
    }
  }, []);

  useEffect(() => {
    // Loading the stored profile on open (and on «إعادة المحاولة»)
    void load().then((next) => {
      if (next === "setup") toSetup();
    });
  }, [load, reloadKey]);

  const reload = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  const setChanges = useCallback((patch: Values) => {
    setResult(null);
    setChangesState((prev) => ({ ...prev, ...patch }));
  }, []);
  const setChange = useCallback((key: string, value: unknown) => setChanges({ [key]: value }), [setChanges]);

  const revert = useCallback(() => {
    setChangesState({});
    setDealbreakers(storedDealbreakers);
  }, [storedDealbreakers]);

  /** The values shown: stored, with the unsaved changes on top */
  const shown = useMemo(() => ({ ...stored, ...changes }), [stored, changes]);

  const plan: SavePlan = useMemo(() => {
    const sendable = sendableChanges(changes, stored, religionEnabled);
    const storedReligion = stored.religion as string | null | undefined;
    const deal = showDealbreakers
      ? {
          stored: dealbreakerKeysToSave(storedDealbreakers, stored as DealbreakerPrefs, storedReligion, gender),
          next: dealbreakerKeysToSave(dealbreakers, { ...stored, ...sendable } as DealbreakerPrefs, storedReligion, gender),
        }
      : undefined;
    return planSave(sendable, stored, deal);
  }, [changes, stored, religionEnabled, showDealbreakers, storedDealbreakers, dealbreakers, gender]);

  const dirty = !!(plan.prefChanges || plan.dealbreakerKeys || plan.fillBody || plan.reviewChanges);
  const pendingKeys = pendingChanges ? Object.keys(pendingChanges) : null;

  const save = useCallback(
    async (note?: string) => {
      if (status !== "ready" || saving || !dirty) return;
      setSaving(true);
      try {
        const r = await runSave(plan, SAVE_API, note?.trim() || undefined);
        const labelOf = (key: string) => editField(key)?.label(gender, country) ?? key;
        setResult({ summary: saveSummary(r, labelOf), partial: r.failed.length > 0 || !!r.error });
        // The failed rows stay marked; everything else now reads from the server
        const failedRows = new Set(r.failed.map(rowKeyOf));
        setChangesState((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => failedRows.has(rowKeyOf(k)))));
        await load({ dealbreakers: r.failed.includes(DEALBREAKERS_KEY) });
        void refreshProfile();
      } finally {
        setSaving(false);
      }
    },
    [status, saving, dirty, plan, gender, country, load, refreshProfile],
  );

  const withdraw = useCallback(async () => {
    setWithdrawing(true);
    setWithdrawError("");
    try {
      const res = await fetch("/api/profile/update-request/withdraw", { method: "POST" });
      // 404: already reviewed or withdrawn; either way nothing is pending any more
      if (res.ok || res.status === 404) {
        setPendingChanges(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setWithdrawError(typeof data.error === "string" && data.error ? data.error : "تعذّر سحب الطلب. يمكنك المحاولة مرة أخرى.");
      }
    } catch {
      setWithdrawError("حدث خطأ في الاتصال. يمكنك المحاولة مرة أخرى.");
    } finally {
      setWithdrawing(false);
    }
  }, []);

  return {
    status,
    reload,
    gender,
    country,
    stored,
    changes,
    shown,
    setChange,
    setChanges,
    revert,
    dealbreakers,
    setDealbreakers,
    pendingKeys,
    pendingChanges,
    plan,
    dirty,
    save,
    saving,
    result,
    withdraw,
    withdrawing,
    withdrawError,
  };
}

export type EditSession = ReturnType<typeof useEditSession>;
