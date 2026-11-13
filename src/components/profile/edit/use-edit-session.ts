"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboardData } from "@/contexts/dashboard-context";
import { toCountry, type CountryCode } from "@/lib/countries";
import { editField } from "@/lib/profile-edit-fields";
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
import { normalizePhone } from "@/lib/phone";

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

/** The guardian as stored (`GET /api/profile/parent-info`); null = none yet */
export interface StoredGuardian {
  parentName: string;
  parentPhone: string;
  relationship: string;
  address: string;
  shareConsent: boolean;
}

/** `PUT /api/profile/parent-info` body, as the legacy edit page sends it */
export type GuardianBody = Omit<StoredGuardian, "shareConsent"> & { shareConsent: boolean };

const SINGLE = "أعزب/عزباء";
const GUARDIAN_SAVED = "حُفظت بيانات وليّ الأمر.";

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * One edit session of the profile edit list (`auth_profile_redesign`): the stored profile and the pending review
 * request, the unsaved changes on top, and one «حفظ» through `sendableChanges` → `planSave` → `runSave`.
 *
 * - A failed load sets `status: "failed"`: nothing is editable and nothing can be saved.
 * - `changes` may hold a value equal to the stored one (a row set back): `planSave` and `rowState` ignore it.
 * - After a save, every change the save didn't take (failed, or made while it ran) stays; the rest reload.
 * - Marital status «أعزب/عزباء» sets the children to 0 (as the legacy edit page); choosing another status again
 *   puts back what the member had set for the children, or nothing.
 * - The guardian loads with the profile (a failed load blocks the page, QA WA-05) and saves on its own
 *   (`saveGuardian`), never through the save bar, also while a review request is pending.
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
  // The unsaved changes, and the children count «أعزب/عزباء» replaced (whether the member had changed it, and to
  // what): one state, so every update is a pure function of the previous one
  const [edit, setEdit] = useState<{ changes: Values; autoChildren: { had: boolean; value: unknown } | null }>({
    changes: {},
    autoChildren: null,
  });
  const changes = edit.changes;
  const [storedDealbreakers, setStoredDealbreakers] = useState<string[]>([]);
  const [dealbreakers, setDealbreakers] = useState<string[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Values | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<EditSaveOutcome | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [guardian, setGuardian] = useState<StoredGuardian | null>(null);
  // The ticks right now, for a save that ends after they changed
  const ticksRef = useRef<string[]>([]);
  useEffect(() => {
    ticksRef.current = dealbreakers;
  }, [dealbreakers]);

  const toSetup = useEffectEvent(() => router.replace("/dashboard/profile/setup"));

  /** Reads the stored profile and the pending request. `keep`: the dealbreaker ticks survive (their save failed) */
  const load = useCallback(async (keep?: { dealbreakers: boolean }): Promise<"setup" | void> => {
    try {
      const [profileRes, requestsRes, parentRes] = await Promise.all([
        sharedGet("/api/profile"),
        fetch("/api/profile/update-request"),
        fetch("/api/profile/parent-info"),
      ]);
      // A missed pending request would let a second one through (the server answers 409), and a missed guardian
      // would show «إضافة» over a stored one: all three must load
      if (!profileRes.ok) throw new Error(`profile ${profileRes.status}`);
      if (!requestsRes.ok) throw new Error(`update requests ${requestsRes.status}`);
      if (!parentRes.ok) throw new Error(`parent info ${parentRes.status}`);
      const profileData = await profileRes.json();
      const requestsData = await requestsRes.json();
      const parentData = await parentRes.json();
      const user = profileData.user;
      // Setup not finished: the setup saves each answer directly (as the legacy edit page)
      if (!user?.profile?.isComplete) return "setup";
      const p = user.profile as Values;
      const pending = (requestsData.requests as { status: string; changes?: Values }[] | undefined)?.find((r) => r.status === "PENDING");
      setGender(user.gender === "FEMALE" ? "FEMALE" : "MALE");
      setCountry(toCountry(user.country));
      setStored(p);
      setPendingChanges(pending ? (pending.changes ?? {}) : null);
      const pi = parentData?.parentInfo;
      setGuardian(
        pi
          ? {
              parentName: pi.parentName || "",
              parentPhone: pi.parentPhone || "",
              relationship: pi.relationship || "",
              address: pi.address || "",
              shareConsent: !!pi.shareConsentAt,
            }
          : null,
      );
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
    setEdit((prev) => {
      const next = { ...prev.changes, ...patch };
      let autoChildren = prev.autoChildren;
      if ("maritalStatus" in patch) {
        if (patch.maritalStatus === SINGLE) {
          autoChildren ??= { had: "childrenCount" in prev.changes, value: prev.changes.childrenCount };
          next.childrenCount = 0;
        } else if (autoChildren) {
          if (autoChildren.had) next.childrenCount = autoChildren.value;
          else delete next.childrenCount;
          autoChildren = null;
        }
      }
      return { changes: next, autoChildren };
    });
  }, []);
  const setChange = useCallback((key: string, value: unknown) => setChanges({ [key]: value }), [setChanges]);

  const revert = useCallback(() => {
    setEdit({ changes: {}, autoChildren: null });
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
      const sentChanges = changes;
      const sentTicks = dealbreakers;
      try {
        const r = await runSave(plan, SAVE_API, note?.trim() || undefined);
        const labelOf = (key: string) => editField(key)?.label(gender, country) ?? key;
        setResult({ summary: saveSummary(r, labelOf), partial: r.failed.length > 0 || !!r.error });
        // Only a failed change, or one made while the save ran, stays. The rest leaves `changes`, also what the
        // plan never sent (set back to stored, or dropped by `sendableChanges`), so the reloaded values show
        const failed = new Set(r.failed);
        setEdit((prev) => {
          const kept = Object.fromEntries(
            Object.entries(prev.changes).filter(([k, v]) => failed.has(k) || !(k in sentChanges) || v !== sentChanges[k]),
          );
          return { changes: kept, autoChildren: "maritalStatus" in kept ? prev.autoChildren : null };
        });
        await load({ dealbreakers: r.failed.includes(DEALBREAKERS_KEY) || ticksRef.current !== sentTicks });
        void refreshProfile();
      } finally {
        setSaving(false);
      }
    },
    [status, saving, dirty, plan, changes, dealbreakers, gender, country, load, refreshProfile],
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

  /** Saves the guardian at once (as the legacy edit page's step 5). Returns the server's refusal, or null */
  const saveGuardian = useCallback(async (body: GuardianBody): Promise<string | null> => {
    try {
      const res = await fetch("/api/profile/parent-info", { method: "PUT", ...json(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return typeof data.error === "string" && data.error ? data.error : "تعذّر حفظ بيانات وليّ الأمر. يمكنك المحاولة مرة أخرى.";
      }
      // As the server stored it (the phone normalized), so a later consent-only save matches «contact unchanged»
      const data = await res.json().catch(() => ({}));
      const pi = data?.parentInfo;
      setGuardian({
        ...body,
        parentPhone: typeof pi?.parentPhone === "string" && pi.parentPhone ? pi.parentPhone : normalizePhone(body.parentPhone, country),
      });
      setResult({ summary: GUARDIAN_SAVED, partial: false });
      void refreshProfile();
      return null;
    } catch {
      return "حدث خطأ في الاتصال. يمكنك المحاولة مرة أخرى.";
    }
  }, [refreshProfile, country]);

  return {
    status,
    guardian,
    saveGuardian,
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
