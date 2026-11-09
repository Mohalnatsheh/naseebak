import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VOICE_SPEEDS,
  hasPlayedVoice,
  markVoicePlayed,
  nextVoiceSpeed,
  seekFraction,
  voiceBars,
} from "@/components/chat/voice-wave";
import { clampZoom, photoSwipe } from "@/components/chat/photo-viewer-logic";

describe("voice waveform from the duration", () => {
  it("is stable for one note, more bars for a longer note within limits, heights in (0, 1]", () => {
    const a = voiceBars("m1", 4);
    expect(voiceBars("m1", 4)).toEqual(a);
    expect(voiceBars("m2", 4)).not.toEqual(a);
    expect(voiceBars("m1", 2).length).toBeLessThanOrEqual(voiceBars("m1", 120).length);
    expect(voiceBars("m1", 0).length).toBeGreaterThanOrEqual(20);
    expect(voiceBars("m1", 600).length).toBeLessThanOrEqual(40);
    for (const h of voiceBars("m3", 30)) {
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThanOrEqual(1);
    }
  });

  it("seek: the fraction from the start edge (right in RTL), clamped", () => {
    const rect = { left: 100, width: 200 };
    expect(seekFraction(150, rect, false)).toBeCloseTo(0.25);
    expect(seekFraction(150, rect, true)).toBeCloseTo(0.75);
    expect(seekFraction(20, rect, false)).toBe(0);
    expect(seekFraction(999, rect, false)).toBe(1);
    expect(seekFraction(150, { left: 0, width: 0 }, false)).toBe(0);
  });

  it("speed cycles 1× → 1.5× → 2× → 1×", () => {
    expect(VOICE_SPEEDS).toEqual([1, 1.5, 2]);
    expect(nextVoiceSpeed(1)).toBe(1.5);
    expect(nextVoiceSpeed(1.5)).toBe(2);
    expect(nextVoiceSpeed(2)).toBe(1);
  });
});

describe("unplayed dot (localStorage, never a crash)", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("remembers played notes", () => {
    expect(hasPlayedVoice("v1")).toBe(false);
    markVoicePlayed("v1");
    expect(hasPlayedVoice("v1")).toBe(true);
    expect(hasPlayedVoice("v2")).toBe(false);
  });

  it("keeps only the newest few hundred ids", () => {
    for (let i = 0; i < 520; i++) markVoicePlayed(`v${i}`);
    expect(hasPlayedVoice("v519")).toBe(true);
    expect(hasPlayedVoice("v0")).toBe(false);
  });

  it("storage that throws (private mode, blocked) counts as played: no dot, no crash", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => markVoicePlayed("v1")).not.toThrow();
    expect(hasPlayedVoice("v1")).toBe(true);
  });

  it("a broken stored value is ignored", () => {
    localStorage.setItem("naseeb:voice-played", "{not json");
    expect(hasPlayedVoice("v1")).toBe(false);
    markVoicePlayed("v1");
    expect(hasPlayedVoice("v1")).toBe(true);
  });
});

describe("photo viewer", () => {
  it("swipe: RTL, a finger moving right brings the next (newer) photo; LTR the opposite; short moves stay", () => {
    expect(photoSwipe({ index: 1, count: 3, dx: 120, rtl: true })).toBe(2);
    expect(photoSwipe({ index: 1, count: 3, dx: -120, rtl: true })).toBe(0);
    expect(photoSwipe({ index: 1, count: 3, dx: -120, rtl: false })).toBe(2);
    expect(photoSwipe({ index: 1, count: 3, dx: 20, rtl: true })).toBe(1);
    expect(photoSwipe({ index: 2, count: 3, dx: 120, rtl: true })).toBe(2);
    expect(photoSwipe({ index: 0, count: 3, dx: -120, rtl: true })).toBe(0);
  });

  it("zoom stays between 1× and 4×", () => {
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(9)).toBe(4);
  });
});
