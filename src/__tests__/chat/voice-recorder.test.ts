import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoiceRecording } from "@/components/chat/voice-recorder";
import { MAX_RECORD_SEC, pickVoiceType, recordedSeconds, recorderErrorMessage, startVoiceRecording, RecorderError } from "@/components/chat/voice-recorder";
import { isHeicFile, preparePhoto } from "@/components/chat/photo-prepare";
import { act, renderHook } from "@testing-library/react";
import { clockLabel, composerMediaMode, useVoiceRecording, type ComposerMedia } from "@/components/chat/media-buttons";

// Tests redefine navigator.mediaDevices: put the original back after each one (unstubAllGlobals doesn't undo it)
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
afterEach(() => {
  if (originalMediaDevices) Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  else delete (navigator as unknown as Record<string, unknown>).mediaDevices;
});

describe("voice recorder helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rounds the length up, at least 1 s, at most the limit", () => {
    expect(recordedSeconds(200)).toBe(1);
    expect(recordedSeconds(10_000)).toBe(10);
    expect(recordedSeconds(10_001)).toBe(11);
    expect(recordedSeconds(500_000)).toBe(MAX_RECORD_SEC);
  });

  it("prefers MP4/AAC (plays on iPhone), else WebM Opus, else nothing", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t === "audio/webm;codecs=opus" || t === "audio/mp4" });
    expect(pickVoiceType()).toBe("audio/mp4");
    vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t === "audio/mp4" });
    expect(pickVoiceType()).toBe("audio/mp4");
    vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t === "audio/webm;codecs=opus" });
    expect(pickVoiceType()).toBe("audio/webm;codecs=opus");
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
    expect(pickVoiceType()).toBeNull();
  });

  it("a refused microphone is a 'denied' error with an Arabic message, not a crash", async () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => true });
    const getUserMedia = vi.fn().mockRejectedValue(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    const error = await startVoiceRecording({ onLimit: () => {} }).catch((e) => e);
    expect(error).toBeInstanceOf(RecorderError);
    expect(error.code).toBe("denied");
    expect(recorderErrorMessage("denied")).toMatch(/الميكروفون/);
  });

  it("formats m:ss with Western digits", () => {
    expect(clockLabel(0)).toBe("0:00");
    expect(clockLabel(9.7)).toBe("0:09");
    expect(clockLabel(180)).toBe("3:00");
  });
});

// ── Photos the browser can't decode (Chrome / Edge and HEIC) ───────────────────────────────────

/** An <img> that never decodes, as in Chrome with a HEIC */
class UndecodableImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_: string) {
    queueMicrotask(() => this.onerror?.());
  }
}

describe("preparePhoto when the browser can't decode the file", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function undecodable() {
    vi.stubGlobal("Image", UndecodableImage);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  }

  it("a HEIC/HEIF by type goes to the server as it is", async () => {
    undecodable();
    for (const type of ["image/heic", "image/heif", "image/HEIC"]) {
      const file = new File(["x"], "IMG_1.bin", { type });
      const out = await preparePhoto(file);
      expect(out).toEqual({ blob: file, width: null, height: null });
    }
  });

  it("a .heic/.heif name with no type goes too, typed image/heic so the upload is named .heic", async () => {
    undecodable();
    for (const name of ["IMG_2.HEIC", "photo.heif"]) {
      const out = await preparePhoto(new File(["xy"], name, { type: "" }));
      expect(out?.blob.type).toBe("image/heic");
      expect(out?.blob.size).toBe(2);
    }
  });

  it("a JPEG/PNG/WebP still goes to the server, and a file with no type (the server reads its first bytes); a known other type is refused here", async () => {
    undecodable();
    const jpg = new File(["x"], "a.jpg", { type: "image/jpeg" });
    expect((await preparePhoto(jpg))?.blob).toBe(jpg);
    expect(await preparePhoto(new File(["x"], "a.gif", { type: "image/gif" }))).toBeNull();
    const untyped = new File(["x"], "photo", { type: "" });
    expect(await preparePhoto(untyped)).toEqual({ blob: untyped, width: null, height: null });
  });

  it("isHeicFile reads the type or the name", () => {
    expect(isHeicFile({ type: "image/heif-sequence", name: "a" })).toBe(true);
    expect(isHeicFile({ type: "", name: "a.heic" })).toBe(true);
    expect(isHeicFile({ type: "image/jpeg", name: "a.jpg" })).toBe(false);
  });
});

describe("composerMediaMode", () => {
  it("Pro members get the buttons; others greyed only when they could buy Pro, else none", () => {
    expect(composerMediaMode({ canSend: true, isPro: true, canBuy: false })).toBe("enabled");
    expect(composerMediaMode({ canSend: true, isPro: false, canBuy: true })).toBe("locked");
    expect(composerMediaMode({ canSend: true, isPro: false, canBuy: false })).toBeNull();
    expect(composerMediaMode({ canSend: false, isPro: true, canBuy: true })).toBeNull();
  });
});

// ── useVoiceRecording: leaving during the mic prompt, and the 3-minute limit ──────────────────────

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = () => true;
  mimeType = "audio/webm;codecs=opus";
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
    queueMicrotask(() => this.onstop?.());
  }
}

function fakeMic() {
  const track = { stop: vi.fn() };
  let grant!: () => void;
  const getUserMedia = vi.fn(
    () =>
      new Promise((resolve) => {
        grant = () => resolve({ getTracks: () => [track] });
      })
  );
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  return { track, grant: () => grant() };
}

function mediaProp() {
  const onVoice = vi.fn<(r: VoiceRecording) => void>();
  const media: ComposerMedia = { mode: "enabled", onPhoto: vi.fn(), onVoice, onLocked: vi.fn(), onError: vi.fn() };
  return Object.assign(media, { onVoice });
}

describe("useVoiceRecording", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeRecorder.instances = [];
  });

  it("leaving the chat during the microphone prompt releases the mic and never uploads", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const mic = fakeMic();
    const media = mediaProp();
    const { result, unmount } = renderHook(() => useVoiceRecording(media));
    let started!: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    unmount(); // left while the prompt was open
    await act(async () => {
      mic.grant();
      await started;
    });
    expect(mic.track.stop).toHaveBeenCalled();
    expect(FakeRecorder.instances[0]?.state ?? "inactive").toBe("inactive");
    await act(async () => {
      vi.advanceTimersByTime(MAX_RECORD_SEC * 1000 + 1000);
    });
    expect(media.onVoice).not.toHaveBeenCalled();
  });

  it("the chat closing during the prompt (buttons gone) releases the mic and never uploads", async () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const mic = fakeMic();
    const media = mediaProp();
    const { result, rerender } = renderHook(({ m }: { m: ComposerMedia | undefined }) => useVoiceRecording(m), {
      initialProps: { m: media as ComposerMedia | undefined },
    });
    let started!: Promise<void>;
    act(() => {
      started = result.current.start();
    });
    rerender({ m: undefined });
    await act(async () => {
      mic.grant();
      await started;
    });
    expect(mic.track.stop).toHaveBeenCalled();
    expect(result.current.state.phase).toBe("idle");
    expect(media.onVoice).not.toHaveBeenCalled();
  });

  it("the buttons going away mid-recording release the mic and bring the text box back (idle, not a frozen bar)", async () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const mic = fakeMic();
    const media = mediaProp();
    const { result, rerender } = renderHook(({ m }: { m: ComposerMedia | undefined }) => useVoiceRecording(m), {
      initialProps: { m: media as ComposerMedia | undefined },
    });
    await act(async () => {
      const started = result.current.start();
      mic.grant();
      await started;
    });
    expect(result.current.state.phase).toBe("recording");
    rerender({ m: undefined });
    await act(async () => {});
    expect(result.current.state.phase).toBe("idle");
    expect(mic.track.stop).toHaveBeenCalled();
    expect(FakeRecorder.instances[0].state).toBe("inactive");
    expect(media.onVoice).not.toHaveBeenCalled();
    // Buttons back: a new recording can start
    rerender({ m: media });
    expect(result.current.state.phase).toBe("idle");
  });

  it("leaving mid-recording stops the recorder and releases the mic", async () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const mic = fakeMic();
    const media = mediaProp();
    const { result, unmount } = renderHook(() => useVoiceRecording(media));
    await act(async () => {
      const started = result.current.start();
      mic.grant();
      await started;
    });
    expect(result.current.state.phase).toBe("recording");
    unmount();
    await act(async () => {});
    expect(FakeRecorder.instances[0].state).toBe("inactive");
    expect(mic.track.stop).toHaveBeenCalled();
    expect(media.onVoice).not.toHaveBeenCalled();
  });

  it("at 3 minutes the recording stops and waits: nothing is sent until «إرسال»", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const mic = fakeMic();
    const media = mediaProp();
    const { result } = renderHook(() => useVoiceRecording(media));
    await act(async () => {
      const started = result.current.start();
      mic.grant();
      await started;
    });
    await act(async () => {
      vi.advanceTimersByTime(MAX_RECORD_SEC * 1000);
    });
    expect(result.current.state.phase).toBe("stopped");
    expect(FakeRecorder.instances[0].state).toBe("inactive");
    expect(mic.track.stop).toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(media.onVoice).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.send();
    });
    expect(media.onVoice).toHaveBeenCalledTimes(1);
    expect(media.onVoice.mock.calls[0][0]).toMatchObject({ durationSec: MAX_RECORD_SEC, type: "audio/webm;codecs=opus" });
    expect(result.current.state.phase).toBe("idle");
  });

  it("cancel after the limit throws the recording away", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const mic = fakeMic();
    const media = mediaProp();
    const { result } = renderHook(() => useVoiceRecording(media));
    await act(async () => {
      const started = result.current.start();
      mic.grant();
      await started;
    });
    await act(async () => {
      vi.advanceTimersByTime(MAX_RECORD_SEC * 1000);
    });
    act(() => result.current.cancel());
    expect(result.current.state.phase).toBe("idle");
    expect(media.onVoice).not.toHaveBeenCalled();
  });
});
