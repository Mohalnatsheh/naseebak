"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { EMOJI_GROUPS } from "./emoji-data";

/**
 * The emoji panel (WhatsApp-style composer, loaded on first open with `next/dynamic`): group tabs on top, a grid of
 * emoji below. On phones it takes the keyboard's place; on desktop it sits in a popover. A pick never moves the focus.
 */
export function EmojiPanel({ onPick, className }: { onPick: (emoji: string) => void; className?: string }) {
  const [group, setGroup] = useState(0);
  const current = EMOJI_GROUPS[group] ?? EMOJI_GROUPS[0];
  return (
    <div role="group" aria-label="لوحة الرموز التعبيرية" className={cn("flex min-h-0 flex-col bg-card", className)}>
      <div className="flex flex-wrap justify-center gap-1 border-b border-border/60 px-1 py-1">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.label}
            type="button"
            aria-pressed={i === group}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setGroup(i)}
            className={cn(
              "min-h-11 rounded-full px-3 text-label transition-colors motion-reduce:transition-none",
              i === group ? "bg-primary/10 font-bold text-primary" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] content-start overflow-y-auto overscroll-contain p-1">
        {current.emoji.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            // Keep the focus (and the cursor) in the text box on desktop
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onPick(emoji)}
            className="flex size-11 items-center justify-center rounded-lg text-2xl hover:bg-muted"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
