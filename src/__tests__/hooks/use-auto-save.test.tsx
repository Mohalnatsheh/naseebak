import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoSave } from "@/hooks/use-auto-save";

const store = new Map<string, string>();
beforeEach(() => {
  vi.useFakeTimers();
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAutoSave (QA WA-14)", () => {
  it("never says «تم الحفظ التلقائي» for the untouched loaded form, only after a change", () => {
    const { result } = renderHook(() => useAutoSave(true));
    act(() => {
      result.current.saveToLocalStorage({ city: "عمّان" }, {}, 1, "u1");
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.savedIndicatorVisible).toBe(false);
    expect(localStorage.getItem("naseeb_profile_draft")).toBeNull();

    act(() => {
      result.current.saveToLocalStorage({ city: "إربد" }, {}, 1, "u1");
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.savedIndicatorVisible).toBe(true);
    expect(localStorage.getItem("naseeb_profile_draft")).toContain("إربد");
  });
});
