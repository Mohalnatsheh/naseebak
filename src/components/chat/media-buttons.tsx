"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Mic, SendHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MAX_RECORD_SEC,
  RecorderError,
  recorderErrorMessage,
  startVoiceRecording,
  type ActiveRecording,
  type VoiceRecording,
} from "./voice-recorder";

/**
 * Photo and voice in the chat composer (Pro).
 * - `enabled`: a Pro member in an open chat.
 * - `locked`: not Pro, but this member could buy it now (`canBuy` from GET /api/pro): the buttons look greyed
 *   with a small «Pro» tag and open the offer.
 * Hidden otherwise (the composer gets no `media` prop): no offer that ends in «غير متاح».
 */
export type MediaMode = "enabled" | "locked";

/** Which photo / voice buttons the composer shows: null = none */
export function composerMediaMode({ canSend, isPro, canBuy }: { canSend: boolean; isPro: boolean; canBuy: boolean }): MediaMode | null {
  if (!canSend) return null;
  if (isPro) return "enabled";
  return canBuy ? "locked" : null;
}

export interface ComposerMedia {
  mode: MediaMode;
  onPhoto: (file: File) => void;
  onVoice: (recording: VoiceRecording) => void;
  /** A greyed button was tapped: open the Pro offer */
  onLocked: () => void;
  /** Recorder problems (permission refused, unsupported browser) as Arabic text */
  onError: (message: string) => void;
}

/** m:ss with Western digits */
export function clockLabel(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ProTag() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -top-1 -end-1 rounded-full border border-accent/40 bg-accent px-1.5 py-px text-[10px] font-bold leading-none text-accent-foreground shadow-sm"
    >
      Pro
    </span>
  );
}

const ROUND_BUTTON =
  "relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-all active:scale-95";

/** The photo picker button (a hidden `accept="image/*"` input behind it) */
export function PhotoButton({ media, disabled }: { media: ComposerMedia; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const locked = media.mode === "locked";
  return (
    <>
      <button
        type="button"
        onClick={() => (locked ? media.onLocked() : input.current?.click())}
        disabled={disabled}
        aria-label={locked ? "إرسال صورة · متاح لأعضاء Pro" : "إرسال صورة"}
        className={cn(
          ROUND_BUTTON,
          locked ? "text-muted-foreground/60 hover:bg-muted/60" : "text-primary hover:bg-primary/10",
          "disabled:opacity-40"
        )}
      >
        <ImagePlus className="h-5 w-5" aria-hidden />
        {locked && <ProTag />}
      </button>
      {!locked && (
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // the same photo can be picked again
            if (file) media.onPhoto(file);
          }}
        />
      )}
    </>
  );
}

/** The mic button: starts recording (the microphone is asked for only now) */
export function MicButton({ media, onStart, disabled }: { media: ComposerMedia; onStart: () => void; disabled?: boolean }) {
  const locked = media.mode === "locked";
  return (
    <button
      type="button"
      onClick={() => (locked ? media.onLocked() : onStart())}
      disabled={disabled}
      aria-label={locked ? "تسجيل رسالة صوتية · متاح لأعضاء Pro" : "تسجيل رسالة صوتية"}
      className={cn(
        ROUND_BUTTON,
        locked
          ? "bg-muted text-muted-foreground/60 hover:bg-muted/80"
          : "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90",
        "disabled:opacity-40"
      )}
    >
      <Mic className="h-5 w-5" aria-hidden />
      {locked && <ProTag />}
    </button>
  );
}

export type RecorderState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "recording"; elapsed: number }
  /** The 3-minute limit was reached: the recorder is stopping, then waits for send or cancel */
  | { phase: "stopping"; elapsed: number }
  | { phase: "stopped"; elapsed: number; recording: VoiceRecording };

/**
 * Recording state for the composer: start, the running clock, send, cancel. At 3 minutes the recording
 * stops and waits for the member to send or cancel (never sent by itself). Leaving the chat (unmount),
 * or the buttons going away, while the microphone prompt is open or while recording releases the
 * microphone and sends nothing.
 */
export function useVoiceRecording(media: ComposerMedia | undefined) {
  const [state, setState] = useState<RecorderState>({ phase: "idle" });
  const active = useRef<ActiveRecording | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(false);
  const mediaRef = useRef(media);
  useEffect(() => {
    mediaRef.current = media;
  });

  const stopClock = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  /** Drop everything: the microphone is released, nothing is sent */
  const discard = useCallback(() => {
    stopClock();
    active.current?.cancel();
    active.current = null;
  }, [stopClock]);

  const fail = useCallback((error: unknown) => {
    if (!mounted.current) return;
    setState({ phase: "idle" });
    mediaRef.current?.onError(recorderErrorMessage(error instanceof RecorderError ? error.code : "failed"));
  }, []);

  /** The limit: stop the recorder and keep the recording for send / cancel */
  const stopAtLimit = useCallback(async () => {
    const rec = active.current;
    if (!rec) return;
    stopClock();
    active.current = null;
    setState({ phase: "stopping", elapsed: MAX_RECORD_SEC });
    try {
      const recording = await rec.stop();
      // Cancelled while the recorder was stopping: stay idle
      if (mounted.current) setState((s) => (s.phase === "stopping" ? { phase: "stopped", elapsed: MAX_RECORD_SEC, recording } : s));
    } catch (error) {
      fail(error);
    }
  }, [fail, stopClock]);

  const send = useCallback(async () => {
    if (state.phase === "stopped") {
      setState({ phase: "idle" });
      mediaRef.current?.onVoice(state.recording);
      return;
    }
    const rec = active.current;
    if (state.phase !== "recording" || !rec) return;
    stopClock();
    active.current = null;
    setState({ phase: "idle" });
    try {
      const recording = await rec.stop();
      if (mounted.current) mediaRef.current?.onVoice(recording);
    } catch (error) {
      fail(error);
    }
  }, [fail, state, stopClock]);

  const cancel = useCallback(() => {
    discard();
    setState({ phase: "idle" });
  }, [discard]);

  const start = useCallback(async () => {
    if (active.current || state.phase !== "idle") return;
    setState({ phase: "starting" });
    let rec: ActiveRecording;
    try {
      rec = await startVoiceRecording({ onLimit: () => void stopAtLimit() });
    } catch (error) {
      fail(error);
      return;
    }
    // Left the chat, or the buttons went away (chat ended, Pro gone), during the microphone prompt
    if (!mounted.current || !mediaRef.current || mediaRef.current.mode !== "enabled") {
      rec.cancel();
      if (mounted.current) setState({ phase: "idle" });
      return;
    }
    active.current = rec;
    const began = Date.now();
    setState({ phase: "recording", elapsed: 0 });
    timer.current = setInterval(() => {
      setState((s) =>
        s.phase === "recording" ? { phase: "recording", elapsed: Math.min(MAX_RECORD_SEC, Math.floor((Date.now() - began) / 1000)) } : s
      );
    }, 250);
  }, [fail, state.phase, stopAtLimit]);

  // The buttons went away mid-recording (chat no longer open for media): release the microphone
  const allowed = media?.mode === "enabled";
  useEffect(() => {
    if (allowed) return;
    discard();
  }, [allowed, discard]);

  // Leaving the chat mid-recording: stop the microphone, send nothing
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      discard();
    };
  }, [discard]);

  return { state, start, send, cancel };
}

/** Shown instead of the text box while recording (or stopped at the limit): cancel, the clock, send */
export function RecordingBar({
  elapsed,
  stopped,
  onSend,
  onCancel,
  sendDisabled,
}: {
  elapsed: number;
  /** The limit was reached: the recording is kept, waiting for send or cancel */
  stopped?: boolean;
  onSend: () => void;
  onCancel: () => void;
  /** The recorder is still finishing: send waits */
  sendDisabled?: boolean;
}) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <button
        type="button"
        onClick={onCancel}
        aria-label="إلغاء التسجيل"
        className={cn(ROUND_BUTTON, "text-destructive hover:bg-destructive/10")}
      >
        <Trash2 className="h-5 w-5" aria-hidden />
      </button>
      <div className="flex min-h-11 flex-1 items-center gap-2 rounded-2xl border border-input bg-background px-4" role="status">
        {stopped ? (
          <span className="text-sm text-muted-foreground">بلغ التسجيل الحد الأقصى</span>
        ) : (
          <>
            <span className="h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden />
            <span className="text-sm text-muted-foreground">جارٍ التسجيل</span>
          </>
        )}
        <span dir="ltr" className="ms-auto font-mono text-sm tabular-nums text-foreground">
          {clockLabel(elapsed)}
          <span className="text-muted-foreground"> / {clockLabel(MAX_RECORD_SEC)}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={onSend}
        disabled={sendDisabled}
        aria-label="إرسال الرسالة الصوتية"
        className={cn(ROUND_BUTTON, "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-40")}
      >
        <SendHorizontal className="h-5 w-5 -scale-x-100" aria-hidden />
      </button>
    </div>
  );
}
