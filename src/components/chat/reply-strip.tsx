"use client";

import { Reply, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReplyQuote } from "@/lib/chat/reply";
import { useRowTabIndex } from "./row-focus";

/** Who wrote the quoted message, as the quote shows it */
export function quoteAuthor(quote: Pick<ReplyQuote, "mine">, partnerName: string): string {
  return quote.mine ? "أنت" : partnerName;
}

/** Above the composer while replying: the original's author and one line; ✕ drops the reply */
export function ReplyStrip({ quote, partnerName, onClose }: { quote: ReplyQuote; partnerName: string; onClose: () => void }) {
  return (
    <div data-testid="reply-strip" className="mb-2 flex items-center gap-2 rounded-xl bg-muted/60 ps-3">
      <Reply className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 border-s-[3px] border-accent py-1.5 ps-2">
        <p className="truncate text-xs font-bold text-accent-ink">{quoteAuthor(quote, partnerName)}</p>
        <p dir="auto" className="truncate text-sm text-muted-foreground">
          {quote.snippet}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="إلغاء الرد"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** The quote at the top of a sent bubble: tapping it scrolls to the original */
export function BubbleQuote({
  quote,
  partnerName,
  mine,
  onOpen,
}: {
  quote: ReplyQuote;
  partnerName: string;
  /** The bubble is mine (navy): the quote uses the light-on-navy tones */
  mine: boolean;
  onOpen?: (id: string) => void;
}) {
  const rowTab = useRowTabIndex();
  const author = quoteAuthor(quote, partnerName);
  return (
    <button
      type="button"
      tabIndex={rowTab}
      onClick={() => onOpen?.(quote.id)}
      // The author is in the name too (QA PA-L7)
      aria-label={`ردّ على ${author}: ${quote.snippet}`}
      className={cn(
        "mb-1 block w-full min-w-32 rounded-lg border-s-[3px] border-accent px-2 py-1 text-start",
        mine ? "bg-primary-foreground/12 hover:bg-primary-foreground/18" : "bg-primary/6 hover:bg-primary/10"
      )}
    >
      {/* The author in dark gold (accent-ink, P2-1); in my navy bubble it stays light (gold on navy measured 2.4:1, QA PA-M8) */}
      <span className={cn("block truncate text-xs font-bold", mine ? "text-primary-foreground" : "text-accent-ink")}>{author}</span>
      <span dir="auto" className={cn("block truncate text-label", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
        {quote.snippet}
      </span>
    </button>
  );
}
