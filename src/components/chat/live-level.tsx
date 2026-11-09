"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BARS = 18;

/**
 * A live waveform of the microphone while recording: bars follow the input level (Web Audio analyser). Where the
 * browser has no Web Audio, the bars stay still at a low level. The bars are drawn straight to the DOM (no re-render
 * per frame).
 */
export function LiveLevel({ stream, className }: { stream: MediaStream | null; className?: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const AudioCtx: typeof AudioContext | undefined =
      typeof window === "undefined" ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!stream || !AudioCtx || !box.current) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioCtx();
    } catch {
      return;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    let source: MediaStreamAudioSourceNode | null = null;
    try {
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch {
      void ctx.close().catch(() => {});
      return;
    }
    const data = new Uint8Array(analyser.fftSize);
    const history: number[] = Array(BARS).fill(0.08);
    let frame = 0;
    let last = 0;
    const draw = (t: number) => {
      frame = requestAnimationFrame(draw);
      if (t - last < 90) return; // a new bar about 11 times a second
      last = t;
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      history.shift();
      history.push(Math.min(1, 0.08 + peak * 1.6));
      const bars = box.current?.children;
      if (!bars) return;
      for (let i = 0; i < bars.length; i++) (bars[i] as HTMLElement).style.transform = `scaleY(${history[i]})`;
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      source?.disconnect();
      void ctx.close().catch(() => {});
    };
  }, [stream]);

  return (
    <div ref={box} aria-hidden className={cn("flex h-6 items-center gap-[3px] overflow-hidden", className)}>
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} className="h-full w-[3px] shrink-0 origin-center rounded-full bg-destructive/70" style={{ transform: "scaleY(0.08)" }} />
      ))}
    </div>
  );
}
