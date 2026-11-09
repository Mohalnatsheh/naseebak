"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ImageOff, Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMedia } from "@/lib/chat/service";
import { clockLabel } from "./media-buttons";
import { hasPlayedVoice, markVoicePlayed, nextVoiceSpeed, seekFraction, voiceBars, type VoiceSpeed } from "./voice-wave";

/** Shown photo width in the bubble; the height follows the photo's own shape */
const PHOTO_WIDTH = 240;
/** Very tall or very wide photos are cropped in the bubble (full size on tap) */
const MIN_RATIO = 0.6;
const MAX_RATIO = 1.8;

/**
 * A photo in a bubble. Tap opens the chat's black full-screen viewer (the time and ticks sit over the photo's corner). A `blob:` URL is the local preview while it uploads; one the browser
 * can't show (a HEIC in Chrome, decoded by the server) says «جارٍ تجهيز الصورة…» until the server's copy arrives, or,
 * once its upload failed (`sendFailed`, the bubble's retry button is under it), a still «صورة لم تُرسل» with no spinner.
 * A saved photo that fails to load offers a tap to try again.
 */
export function PhotoBubble({
  media,
  mine,
  sendFailed = false,
  onOpen,
}: {
  media: ChatMedia;
  mine: boolean;
  sendFailed?: boolean;
  /** Tap: the chat's full-screen photo viewer (photo-viewer.tsx) */
  onOpen?: () => void;
}) {
  // The address that failed (a new url, the server's copy after the preview, starts fresh) and the retry count
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ratio = media.width && media.height ? media.width / media.height : 1;
  const shown = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
  const local = media.url.startsWith("blob:");
  const src = local || attempt === 0 ? media.url : `${media.url}?retry=${attempt}`;
  const style = { width: PHOTO_WIDTH, maxWidth: "100%", aspectRatio: String(shown) };
  const box = cn("flex items-center justify-center rounded-xl text-sm", mine ? "bg-primary-foreground/10" : "bg-muted");

  if (failedUrl === src) {
    if (local && sendFailed) {
      return (
        <div style={style} className={box} role="status">
          <ImageOff className="me-1.5 h-4 w-4" aria-hidden />
          صورة لم تُرسل
        </div>
      );
    }
    if (local) {
      return (
        <div style={style} className={box} role="status">
          <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden />
          جارٍ تجهيز الصورة…
        </div>
      );
    }
    return (
      <button type="button" style={style} className={cn(box, "flex-col gap-1")} onClick={() => setAttempt((n) => n + 1)}>
        <span>تعذّر عرض الصورة</span>
        <span className="text-xs underline underline-offset-2">اضغط لإعادة المحاولة</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="عرض الصورة بالحجم الكامل"
      style={style}
      className={cn("relative block overflow-hidden rounded-lg", mine ? "bg-primary-foreground/10" : "bg-muted")}
    >
      {local ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: preview of a photo still uploading
        <img src={src} alt="صورة" draggable={false} onError={() => setFailedUrl(src)} className="h-full w-full object-cover" />
      ) : (
        <Image
          src={src}
          alt="صورة"
          width={media.width ?? PHOTO_WIDTH}
          height={media.height ?? PHOTO_WIDTH}
          unoptimized
          draggable={false}
          onError={() => setFailedUrl(src)}
          className="h-full w-full object-cover"
        />
      )}
    </button>
  );
}

/** Only one voice note plays at a time */
let playing: HTMLAudioElement | null = null;

/**
 * A voice note: play/pause, a waveform drawn from its length that can be tapped or dragged to seek (arrow keys too),
 * m:ss (the time played while playing, else the length), the speed 1× / 1.5× / 2× while it plays, and a dot on the
 * other person's notes until played in this browser.
 */
export function VoiceBubble({ media, mine, messageId }: { media: ChatMedia; mine: boolean; messageId: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const wave = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [current, setCurrent] = useState(0);
  const [length, setLength] = useState<number>(media.durationSec ?? 0);
  const [error, setError] = useState(false);
  const [speed, setSpeed] = useState<VoiceSpeed>(1);
  // A seek before the file is loaded: applied once it is
  const pendingSeek = useRef<number | null>(null);
  const bars = useMemo(() => voiceBars(messageId, media.durationSec), [messageId, media.durationSec]);
  const [played, setPlayed] = useState(() => mine || messageId.startsWith("tmp-") || hasPlayedVoice(messageId));

  useEffect(() => {
    const el = audio.current;
    return () => {
      if (el && playing === el) playing = null;
      el?.pause();
    };
  }, []);

  function applySpeed(el: HTMLAudioElement, rate: number) {
    el.defaultPlaybackRate = rate;
    el.playbackRate = rate;
  }

  async function toggle() {
    const el = audio.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    if (playing && playing !== el) playing.pause();
    playing = el;
    setError(false);
    if (!played) {
      setPlayed(true);
      markVoicePlayed(messageId);
    }
    if (el.readyState < 2) setState("loading");
    applySpeed(el, speed);
    try {
      await el.play();
    } catch {
      setState("idle");
      setError(true);
    }
  }

  // The declared length until the file's own is known (MediaRecorder WebM may report an endless one)
  const total = length > 0 ? length : 0;
  const progress = total > 0 ? Math.min(1, current / total) : 0;
  const active = state === "playing" || state === "loading" || (state === "paused" && current > 0);

  function seekTo(fraction: number) {
    if (!total) return;
    const t = Math.min(total, Math.max(0, fraction * total));
    setCurrent(t);
    const el = audio.current;
    if (el && el.readyState >= 1) el.currentTime = t;
    else pendingSeek.current = t;
    if (state === "idle") setState("paused"); // the dot moved: the clock shows where it will play from
  }

  function seekFromPointer(e: React.PointerEvent<HTMLDivElement>) {
    const el = wave.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    seekTo(seekFraction(e.clientX, rect, getComputedStyle(el).direction === "rtl"));
  }

  const fg = mine ? "bg-primary-foreground" : "bg-primary";
  const bg = mine ? "bg-primary-foreground/35" : "bg-primary/25";

  return (
    <div className="flex min-w-56 items-center gap-1.5 py-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={state === "playing" ? "إيقاف مؤقت" : "تشغيل الرسالة الصوتية"}
        className={cn(
          "relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-95",
          mine ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
        )}
      >
        {state === "loading" ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : state === "playing" ? (
          <Pause className="h-5 w-5" aria-hidden />
        ) : (
          <Play className="h-5 w-5" aria-hidden />
        )}
        {!played && (
          <span data-testid="voice-unplayed" aria-label="لم تُسمع بعد" className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-card bg-accent" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          ref={wave}
          role="slider"
          tabIndex={0}
          aria-label="موضع التشغيل"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-valuetext={`${clockLabel(current)} / ${clockLabel(total)}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            seekFromPointer(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture?.(e.pointerId)) seekFromPointer(e);
          }}
          onKeyDown={(e) => {
            if (!total) return;
            // Arrows follow the reading direction: towards the end of the note is left in RTL
            const step = 5 / total;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
              const forward = (e.key === "ArrowLeft") === rtl;
              seekTo(progress + (forward ? step : -step));
            }
          }}
          className="flex h-8 cursor-pointer touch-none items-center gap-[2px] rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {bars.map((h, i) => (
            <span
              key={i}
              aria-hidden
              className={cn("min-w-[2px] flex-1 rounded-full transition-colors", (i + 0.5) / bars.length <= progress ? fg : bg)}
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          ))}
        </div>
        <p className={cn("mt-0.5 text-xs", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {error ? (
            "تعذّر تشغيل الرسالة الصوتية"
          ) : (
            <span dir="ltr" className="tabular-nums">
              {clockLabel(active ? current : total)}
            </span>
          )}
        </p>
      </div>
      {active && (
        <button
          type="button"
          onClick={() => {
            const next = nextVoiceSpeed(speed);
            setSpeed(next);
            if (audio.current) applySpeed(audio.current, next);
          }}
          aria-label={`سرعة التشغيل ${speed}×`}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center"
        >
          <span
            dir="ltr"
            className={cn(
              "rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums",
              mine ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"
            )}
          >
            {speed}×
          </span>
        </button>
      )}
      <audio
        ref={audio}
        src={media.url}
        // The exact length (the stored one is rounded up): only the header is fetched (QA WC-18)
        preload="metadata"
        className="hidden"
        onPlaying={(e) => {
          applySpeed(e.currentTarget, speed);
          setState("playing");
        }}
        onPause={() => setState((s) => (s === "idle" ? s : "paused"))}
        onWaiting={() => setState("loading")}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          // The file's own length (the stored note is AAC, finite) is exact: the declared one is rounded up, which
          // left the bar short of the end. An endless WebM length keeps the declared one
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setLength(d);
          if (pendingSeek.current !== null) {
            e.currentTarget.currentTime = pendingSeek.current;
            pendingSeek.current = null;
          }
        }}
        onEnded={() => {
          setState("idle");
          setCurrent(0);
          if (playing === audio.current) playing = null;
        }}
        onError={() => {
          setState("idle");
          setError(true);
        }}
      />
    </div>
  );
}
