import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoiceRecording } from "@/components/chat/voice-recorder";
import { MAX_RECORD_SEC, pickVoiceType, recordedSeconds, recorderErrorMessage, startVoiceRecording, RecorderError } from "@/components/chat/voice-recorder";
import { act, renderHook } from "@testing-library/react";
import { clockLabel, useVoiceRecording, type ComposerMedia } from "@/components/chat/media-buttons";

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

  it("prefers WebM Opus, else MP4, else nothing", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t === "audio/webm;codecs=opus" || t === "audio/mp4" });
    expect(pickVoiceType()).toBe("audio/webm;codecs=opus");
    vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t === "audio/mp4" });
    expect(pickVoiceType()).toBe("audio/mp4");
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
