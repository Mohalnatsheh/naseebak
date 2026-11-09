"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ChatMedia } from "@/lib/chat/service";
import { clockLabel } from "./media-buttons";

/** Shown photo width in the bubble; the height follows the photo's own shape */
const PHOTO_WIDTH = 240;
/** Very tall or very wide photos are cropped in the bubble (full size on tap) */
const MIN_RATIO = 0.6;
const MAX_RATIO = 1.8;

/** A photo in a bubble. Tap opens it full size. A `blob:` URL is the local preview while it uploads. */
export function PhotoBubble({ media, mine }: { media: ChatMedia; mine: boolean }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const ratio = media.width && media.height ? media.width / media.height : 1;
  const shown = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
  const local = media.url.startsWith("blob:");
  const style = { width: PHOTO_WIDTH, maxWidth: "100%", aspectRatio: String(shown) };

  if (failed) {
    return (
      <div style={style} className={cn("flex items-center justify-center rounded-xl text-sm", mine ? "bg-primary-foreground/10" : "bg-muted")}>
        تعذّر عرض الصورة
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="عرض الصورة بالحجم الكامل"
        style={style}
        className={cn("relative block overflow-hidden rounded-xl", mine ? "bg-primary-foreground/10" : "bg-muted")}
      >
        {local ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: preview of a photo still uploading
          <img src={media.url} alt="صورة" className="h-full w-full object-cover" />
        ) : (
          <Image
            src={media.url}
            alt="صورة"
            width={media.width ?? PHOTO_WIDTH}
            height={media.height ?? PHOTO_WIDTH}
            unoptimized
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100%-1rem)] gap-0 p-2 pt-14 sm:max-w-3xl">
          <DialogTitle className="sr-only">صورة</DialogTitle>
          <div className="flex items-center justify-center">
            {local ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob: preview of a photo still uploading
              <img src={media.url} alt="صورة" className="max-h-[calc(100dvh-7rem)] w-auto max-w-full rounded-md object-contain" />
            ) : (
              <Image
                src={media.url}
                alt="صورة"
                width={media.width ?? 1200}
                height={media.height ?? 1200}
                unoptimized
                className="max-h-[calc(100dvh-7rem)] w-auto max-w-full rounded-md object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Only one voice note plays at a time */
let playing: HTMLAudioElement | null = null;

/** A voice note: play/pause, a progress bar and m:ss (the time played while playing, else the length). */
export function VoiceBubble({ media, mine }: { media: ChatMedia; mine: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [current, setCurrent] = useState(0);
  const [length, setLength] = useState<number>(media.durationSec ?? 0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = audio.current;
    return () => {
      if (el && playing === el) playing = null;
      el?.pause();
    };
  }, []);

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
    if (el.readyState < 2) setState("loading");
    try {
      await el.play();
    } catch {
      setState("idle");
      setError(true);
    }
  }

  // MediaRecorder WebM often reports an endless duration: fall back to the recorder's
  const total = length > 0 ? length : 0;
  const progress = total > 0 ? Math.min(1, current / total) : 0;
  const active = state === "playing" || state === "loading" || (state === "paused" && current > 0);

  return (
    <div className="flex min-w-52 items-center gap-2 py-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={state === "playing" ? "إيقاف مؤقت" : "تشغيل الرسالة الصوتية"}
        className={cn(
          "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-95",
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
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="progressbar"
          aria-label="تقدّم التشغيل"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className={cn("h-1.5 overflow-hidden rounded-full", mine ? "bg-primary-foreground/25" : "bg-primary/15")}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-200", mine ? "bg-primary-foreground" : "bg-primary")}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className={cn("mt-1 text-xs", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {error ? (
            "تعذّر تشغيل الرسالة الصوتية"
          ) : (
            <span dir="ltr" className="tabular-nums">
              {clockLabel(active ? current : total)}
            </span>
          )}
        </p>
      </div>
      <audio
        ref={audio}
        src={media.url}
        preload="none"
        className="hidden"
        onPlaying={() => setState("playing")}
        onPause={() => setState((s) => (s === "idle" ? s : "paused"))}
        onWaiting={() => setState("loading")}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0 && !(media.durationSec && media.durationSec > 0)) setLength(d);
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
