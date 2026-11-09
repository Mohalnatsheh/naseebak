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
 * - `locked`: not Pro while Pro is on sale: the buttons look greyed with a small «Pro» tag and open the offer.
 * Hidden otherwise (the composer gets no `media` prop).
 */
export type MediaMode = "enabled" | "locked";

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

type RecorderState = { phase: "idle" } | { phase: "starting" } | { phase: "recording"; elapsed: number };

/** Recording state for the composer: start, the running clock, send, cancel; auto-sends at 3 minutes */
export function useVoiceRecording(media: ComposerMedia | undefined) {
  const [state, setState] = useState<RecorderState>({ phase: "idle" });
  const active = useRef<ActiveRecording | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRef = useRef(media);
  useEffect(() => {
    mediaRef.current = media;
  });

  const clear = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    active.current = null;
    setState({ phase: "idle" });
  }, []);

  const send = useCallback(async () => {
    const rec = active.current;
    if (!rec) return;
    clear();
    try {
      const recording = await rec.stop();
      mediaRef.current?.onVoice(recording);
    } catch (error) {
      mediaRef.current?.onError(recorderErrorMessage(error instanceof RecorderError ? error.code : "failed"));
    }
  }, [clear]);

  const cancel = useCallback(() => {
    active.current?.cancel();
    clear();
  }, [clear]);

  const start = useCallback(async () => {
    if (active.current || state.phase !== "idle") return;
    setState({ phase: "starting" });
    try {
      const rec = await startVoiceRecording({ onLimit: () => void send() });
      active.current = rec;
      const began = Date.now();
      setState({ phase: "recording", elapsed: 0 });
      timer.current = setInterval(() => {
        setState({ phase: "recording", elapsed: Math.min(MAX_RECORD_SEC, Math.floor((Date.now() - began) / 1000)) });
      }, 250);
    } catch (error) {
      setState({ phase: "idle" });
      mediaRef.current?.onError(recorderErrorMessage(error instanceof RecorderError ? error.code : "failed"));
    }
  }, [send, state.phase]);

  // Leaving the chat mid-recording: stop the microphone, send nothing
  useEffect(
    () => () => {
      active.current?.cancel();
      if (timer.current) clearInterval(timer.current);
    },
    []
  );

  return { state, start, send, cancel };
}

/** Shown instead of the text box while recording: cancel, the running clock, send */
export function RecordingBar({ elapsed, onSend, onCancel }: { elapsed: number; onSend: () => void; onCancel: () => void }) {
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
        <span className="h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden />
        <span className="text-sm text-muted-foreground">جارٍ التسجيل</span>
        <span dir="ltr" className="ms-auto font-mono text-sm tabular-nums text-foreground">
          {clockLabel(elapsed)}
          <span className="text-muted-foreground"> / {clockLabel(MAX_RECORD_SEC)}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={onSend}
        aria-label="إرسال الرسالة الصوتية"
        className={cn(ROUND_BUTTON, "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90")}
      >
        <SendHorizontal className="h-5 w-5 -scale-x-100" aria-hidden />
      </button>
    </div>
  );
}
