import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_RECORD_SEC, pickVoiceType, recordedSeconds, recorderErrorMessage, startVoiceRecording, RecorderError } from "@/components/chat/voice-recorder";
import { clockLabel } from "@/components/chat/media-buttons";

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
