"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
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

export function ProTag() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -top-1 -end-1 rounded-full border border-accent/40 bg-accent px-1.5 py-px text-[11px] font-bold leading-none text-accent-foreground shadow-sm"
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

/** Why a recording stopped and now waits for send or cancel */
export type StopReason = "limit" | "hidden" | "manual" | "interrupted";

export type RecorderState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "recording"; elapsed: number }
  /** Stopped (the limit, the tab hidden, «إيقاف», a lost press): the recorder is finishing, then waits */
  | { phase: "stopping"; elapsed: number; reason: StopReason }
  | { phase: "stopped"; elapsed: number; recording: VoiceRecording; reason: StopReason };

/**
 * Recording state for the composer: start, the running clock, pause (stop and wait), send, cancel. At 3 minutes,
 * when the tab is hidden, or when the press is lost, the recording stops and waits for the member to send or cancel
 * (never sent by itself). Leaving the chat (unmount), or the buttons going away, while the microphone prompt is open
 * or while recording releases the microphone and sends nothing.
 */
export function useVoiceRecording(media: ComposerMedia | undefined) {
  const [state, setState] = useState<RecorderState>({ phase: "idle" });
  const [stream, setStream] = useState<MediaStream | null>(null);
  // The buttons went away (chat ended, Pro gone): the bar goes back to idle, so the text box returns instead of a
  // frozen recording bar (state adjusted during render; the effect below releases the microphone)
  const allowed = media?.mode === "enabled";
  const [wasAllowed, setWasAllowed] = useState(allowed);
  if (wasAllowed !== allowed) {
    setWasAllowed(allowed);
    if (!allowed && state.phase !== "idle") setState({ phase: "idle" });
  }
  const active = useRef<ActiveRecording | null>(null);
  const began = useRef(0);
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

  /** Stop the recorder and keep the recording for send / cancel (never sent from here) */
  const pause = useCallback(
    async (reason: StopReason) => {
      const rec = active.current;
      if (!rec) return;
      stopClock();
      active.current = null;
      setStream(null);
      const elapsed = reason === "limit" ? MAX_RECORD_SEC : Math.min(MAX_RECORD_SEC, Math.floor((Date.now() - began.current) / 1000));
      setState({ phase: "stopping", elapsed, reason });
      try {
        const recording = await rec.stop();
        // Cancelled while the recorder was stopping: stay idle
        if (mounted.current) setState((s) => (s.phase === "stopping" ? { phase: "stopped", elapsed, recording, reason } : s));
      } catch (error) {
        fail(error);
      }
    },
    [fail, stopClock]
  );

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
    setStream(null);
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

  /**
   * Ask for the microphone and record. `keep` is asked once the microphone is granted: false (the press was already
   * released or cancelled) gives it straight back. Resolves true when recording.
   */
  const start = useCallback(
    async (opts?: { keep?: () => boolean }): Promise<boolean> => {
      if (active.current || state.phase !== "idle") return false;
      setState({ phase: "starting" });
      let rec: ActiveRecording;
      try {
        rec = await startVoiceRecording({ onLimit: () => void pause("limit") });
      } catch (error) {
        fail(error);
        return false;
      }
      // Left the chat, the buttons went away (chat ended, Pro gone), or the press ended, during the microphone prompt
      if (!mounted.current || !mediaRef.current || mediaRef.current.mode !== "enabled" || (opts?.keep && !opts.keep())) {
        rec.cancel();
        if (mounted.current) setState({ phase: "idle" });
        return false;
      }
      active.current = rec;
      began.current = Date.now();
      setStream(rec.stream ?? null);
      setState({ phase: "recording", elapsed: 0 });
      timer.current = setInterval(() => {
        setState((s) =>
          s.phase === "recording" ? { phase: "recording", elapsed: Math.min(MAX_RECORD_SEC, Math.floor((Date.now() - began.current) / 1000)) } : s
        );
      }, 250);
      return true;
    },
    [fail, state.phase, pause]
  );

  // The buttons went away mid-recording (chat no longer open for media): release the microphone
  useEffect(() => {
    if (allowed) return;
    discard();
  }, [allowed, discard]);

  // The tab (or the phone's browser) went to the background: stop and wait, like the app
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void pause("hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  // Leaving the chat mid-recording: stop the microphone, send nothing
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      discard();
    };
  }, [discard]);

  // The microphone stream, only while recording (the live level)
  return { state, stream: state.phase === "recording" ? stream : null, start, pause, send, cancel };
}
