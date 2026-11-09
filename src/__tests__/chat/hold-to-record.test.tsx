/**
 * Hold to record (website): release sends, slide to cancel, slide up to lock; a pointer that leaves, is cancelled or
 * meets a second finger, and a tab that goes hidden, stop the recording and wait — never a silent send (Review Focus 3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { ChatComposer } from "@/components/chat/chat-composer";
import { useVoiceRecording, type ComposerMedia } from "@/components/chat/media-buttons";
import { CANCEL_SLIDE_PX, LOCK_SLIDE_PX } from "@/components/chat/chat-interactions";
import type { VoiceRecording } from "@/components/chat/voice-recorder";

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = () => true;
  mimeType = "audio/mp4";
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

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
let clock = 0;
let visibility: DocumentVisibilityState = "visible";
let track: { stop: ReturnType<typeof vi.fn> };
let grant: () => void;

beforeEach(() => {
  clock = 0;
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  track = { stop: vi.fn() };
  const getUserMedia = vi.fn(
    () =>
      new Promise((resolve) => {
        grant = () => resolve({ getTracks: () => [track] });
      })
  );
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeRecorder.instances = [];
  if (originalMediaDevices) Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  else delete (navigator as unknown as Record<string, unknown>).mediaDevices;
});

function mediaProp() {
  const onVoice = vi.fn<(r: VoiceRecording) => void>();
  const onError = vi.fn<(m: string) => void>();
  const media: ComposerMedia = { mode: "enabled", onPhoto: vi.fn(), onVoice, onLocked: vi.fn(), onError };
  return Object.assign(media, { onVoice, onError });
}

function renderComposer(media = mediaProp()) {
  render(<div dir="rtl"><ChatComposer onSend={vi.fn(async () => true)} error={null} onTyping={vi.fn()} media={media} /></div>);
  return media;
}

const mic = () => screen.getByRole("button", { name: /تسجيل رسالة صوتية/ });

/** Press the mic and let the microphone be granted: recording */
async function pressAndRecord(x = 300, y = 700) {
  fireEvent.pointerDown(mic(), { pointerId: 1, button: 0, clientX: x, clientY: y, isPrimary: true });
  await act(async () => {
    grant();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("hold to record: the composer", () => {
  it("press, hold and release sends the note", async () => {
    const media = renderComposer();
    await pressAndRecord();
    expect(screen.getByText("اسحب للإلغاء")).toBeInTheDocument();
    clock = 2500;
    await act(async () => {
      fireEvent.pointerUp(mic(), { pointerId: 1, clientX: 300, clientY: 700 });
    });
    expect(media.onVoice).toHaveBeenCalledTimes(1);
    expect(media.onVoice.mock.calls[0][0].durationSec).toBe(3);
    expect(track.stop).toHaveBeenCalled();
  });

  it("released under 1 s: discarded with «الرسالة قصيرة جداً»", async () => {
    const media = renderComposer();
    await pressAndRecord();
    clock = 600;
    await act(async () => {
      fireEvent.pointerUp(mic(), { pointerId: 1, clientX: 300, clientY: 700 });
    });
    expect(media.onVoice).not.toHaveBeenCalled();
    expect(media.onError).toHaveBeenCalledWith("الرسالة قصيرة جداً");
  });

  it("sliding towards the start edge cancels: nothing sent, mic released", async () => {
    const media = renderComposer();
    await pressAndRecord(300, 700);
    clock = 3000;
    await act(async () => {
      fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 300 + CANCEL_SLIDE_PX + 5, clientY: 700 });
    });
    await act(async () => {
      fireEvent.pointerUp(mic(), { pointerId: 1, clientX: 300 + CANCEL_SLIDE_PX + 5, clientY: 700 });
    });
    expect(media.onVoice).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(FakeRecorder.instances[0].state).toBe("inactive");
    expect(screen.queryByText("اسحب للإلغاء")).toBeNull();
  });

  it("the reply strip stays in view while recording (the note goes as that reply)", async () => {
    const media = mediaProp();
    render(
      <div dir="rtl">
        <ChatComposer
          onSend={vi.fn(async () => true)} error={null} onTyping={vi.fn()} media={media}
          replyTo={{ id: "q1", mine: false, kind: "TEXT", snippet: "سؤالها" }} partnerName="سلمى" onCancelReply={vi.fn()}
        />
      </div>
    );
    await pressAndRecord();
    expect(screen.getByText("اسحب للإلغاء")).toBeInTheDocument();
    expect(screen.getByText("سؤالها")).toBeInTheDocument();
  });

  it("sliding up locks: release doesn't send; stop, cancel and send are shown; send sends", async () => {
    const media = renderComposer();
    await pressAndRecord(300, 700);
    clock = 4000;
    await act(async () => {
      fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 300, clientY: 700 - LOCK_SLIDE_PX - 5 });
    });
    await act(async () => {
      fireEvent.pointerUp(document.body, { pointerId: 1 });
    });
    expect(media.onVoice).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "إيقاف التسجيل" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إلغاء التسجيل" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إرسال الرسالة الصوتية" }));
    });
    expect(media.onVoice).toHaveBeenCalledTimes(1);
  });

  it("locked, then stop: the note waits for send or cancel", async () => {
    const media = renderComposer();
    await pressAndRecord(300, 700);
    clock = 4000;
    await act(async () => {
      fireEvent.pointerMove(mic(), { pointerId: 1, clientX: 300, clientY: 700 - LOCK_SLIDE_PX - 5 });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إيقاف التسجيل" }));
    });
    expect(FakeRecorder.instances[0].state).toBe("inactive");
    expect(media.onVoice).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إلغاء التسجيل" }));
    });
    expect(media.onVoice).not.toHaveBeenCalled();
    expect(mic()).toBeInTheDocument();
  });

  it.each([
    ["pointercancel", () => fireEvent.pointerCancel(mic(), { pointerId: 1 })],
    ["the pointer leaving the button (no capture)", () => fireEvent.pointerLeave(mic(), { pointerId: 1 })],
    ["a second finger", () => fireEvent.pointerDown(document.body, { pointerId: 2, clientX: 10, clientY: 10 })],
    ["the tab going hidden", () => {
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    }],
  ])("%s mid-hold stops and waits: never a silent send", async (_name, interrupt) => {
    const media = renderComposer();
    await pressAndRecord();
    const button = mic(); // the same round button (it turns into send)
    clock = 5000;
    await act(async () => {
      interrupt();
    });
    // A release afterwards doesn't send either
    await act(async () => {
      fireEvent.pointerUp(button, { pointerId: 1 });
    });
    expect(FakeRecorder.instances[0].state).toBe("inactive");
    expect(media.onVoice).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "إرسال الرسالة الصوتية" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إرسال الرسالة الصوتية" }));
    });
    expect(media.onVoice).toHaveBeenCalledTimes(1);
  });

  it("released while the microphone prompt is still open: nothing is recorded or sent", async () => {
    const media = renderComposer();
    fireEvent.pointerDown(mic(), { pointerId: 1, button: 0, clientX: 300, clientY: 700, isPrimary: true });
    fireEvent.pointerUp(mic(), { pointerId: 1, clientX: 300, clientY: 700 });
    await act(async () => {
      grant();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(track.stop).toHaveBeenCalled();
    expect(media.onVoice).not.toHaveBeenCalled();
    expect(screen.queryByText("اسحب للإلغاء")).toBeNull();
  });

  it("the keyboard (a click with no press) records hands-free, waiting for send", async () => {
    const media = renderComposer();
    fireEvent.click(mic());
    await act(async () => {
      grant();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "إيقاف التسجيل" })).toBeInTheDocument();
    expect(media.onVoice).not.toHaveBeenCalled();
  });

  it("a locked (non-Pro) mic opens the offer and records nothing", () => {
    const media = mediaProp();
    media.mode = "locked";
    renderComposer(media);
    fireEvent.pointerDown(mic(), { pointerId: 1, button: 0, clientX: 300, clientY: 700 });
    fireEvent.click(mic());
    expect(media.onLocked).toHaveBeenCalledTimes(1);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});

describe("useVoiceRecording: stop and wait", () => {
  it("pause() keeps the recording for send / cancel", async () => {
    const media = mediaProp();
    const { result } = renderHook(() => useVoiceRecording(media));
    await act(async () => {
      const started = result.current.start();
      grant();
      await started;
    });
    clock = 3000;
    await act(async () => {
      await result.current.pause("manual");
    });
    expect(result.current.state).toMatchObject({ phase: "stopped", reason: "manual" });
    expect(media.onVoice).not.toHaveBeenCalled();
  });

  it("start({ keep }) gives the microphone back when the press is already over", async () => {
    const media = mediaProp();
    const { result } = renderHook(() => useVoiceRecording(media));
    let ok: boolean | undefined;
    await act(async () => {
      const started = result.current.start({ keep: () => false });
      grant();
      ok = await started;
    });
    expect(ok).toBe(false);
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.state.phase).toBe("idle");
  });
});
