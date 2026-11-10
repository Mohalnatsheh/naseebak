"use client";

import { Sparkles } from "lucide-react";

/**
 * Conversation starters above the composer (from GET /api/chats/[id] → `starters`, only while I haven't written).
 * A tap fills the box, to edit before sending; a starter goes through the filter like any message.
 */
export function StarterChips({ starters, onPick }: { starters: readonly string[]; onPick: (text: string) => void }) {
  if (starters.length === 0) return null;
  return (
    <div data-testid="starter-chips" className="mb-2">
      <p className="mb-1.5 flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
        اقتراحات لبدء المحادثة
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            dir="auto"
            onClick={() => onPick(s)}
            className="min-h-11 rounded-full border border-primary/20 bg-card px-3 py-1.5 text-label leading-snug text-foreground/85 transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
