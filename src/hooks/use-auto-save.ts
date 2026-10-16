"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "naseeb_profile_draft";
const DEBOUNCE_MS = 1000;
const EXPIRY_DAYS = 30;
const INDICATOR_DURATION_MS = 2000;

interface DraftData {
  /** Whose draft this is — a shared device must never show one person's draft to another */
  ownerId?: string;
  form: Record<string, unknown>;
  parentForm: Record<string, unknown>;
  step: number;
  savedAt: string; // ISO timestamp
}

export function useAutoSave(enabled: boolean) {
  const [savedIndicatorVisible, setSavedIndicatorVisible] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (indicatorTimer.current) clearTimeout(indicatorTimer.current);
    };
  }, []);

  const showIndicator = useCallback(() => {
    setSavedIndicatorVisible(true);
    if (indicatorTimer.current) clearTimeout(indicatorTimer.current);
    indicatorTimer.current = setTimeout(() => {
      setSavedIndicatorVisible(false);
    }, INDICATOR_DURATION_MS);
  }, []);

  const saveToLocalStorage = useCallback(
    (form: Record<string, unknown>, parentForm: Record<string, unknown>, step: number, ownerId: string) => {
      if (!enabled || !ownerId) return;

      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      debounceTimer.current = setTimeout(() => {
        try {
          const draft: DraftData = {
            ownerId,
            form,
            parentForm,
            step,
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
          showIndicator();
        } catch {
          // localStorage unavailable (private browsing, quota exceeded) — silent fail
        }
      }, DEBOUNCE_MS);
    },
    [enabled, showIndicator]
  );

  const restoreDraft = useCallback((ownerId: string): DraftData | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const draft: DraftData = JSON.parse(raw);

      // Someone else's draft (or an old draft without an owner): drop it
      if (!ownerId || draft.ownerId !== ownerId) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      // Check expiry
      const savedAt = new Date(draft.savedAt);
      const now = new Date();
      const diffDays = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > EXPIRY_DAYS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      return draft;
    } catch {
      return null;
    }
  }, []);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Silent fail
    }
  }, []);

  const saveToServer = useCallback(
    async (
      step: number,
      formData: Record<string, unknown>
    ) => {
      try {
        await fetch("/api/profile/draft", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formData, setupStep: step }),
        });
      } catch {
        // Fire-and-forget — silent failures OK
      }
    },
    []
  );

  return {
    savedIndicatorVisible,
    saveToLocalStorage,
    restoreDraft,
    clearDraft,
    saveToServer,
  };
}
