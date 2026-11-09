"use client";

import { Reply, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReplyQuote } from "@/lib/chat/reply";

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
        <p className="truncate text-xs font-bold text-primary">{quoteAuthor(quote, partnerName)}</p>
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
  return (
    <button
      type="button"
      onClick={() => onOpen?.(quote.id)}
      aria-label={`الرسالة الأصلية: ${quote.snippet}`}
      className={cn(
        "mb-1 block w-full min-w-32 rounded-lg border-s-[3px] border-accent px-2 py-1 text-start",
        mine ? "bg-primary-foreground/12 hover:bg-primary-foreground/18" : "bg-primary/6 hover:bg-primary/10"
      )}
    >
      <span className={cn("block truncate text-xs font-bold", mine ? "text-accent" : "text-primary")}>{quoteAuthor(quote, partnerName)}</span>
      <span dir="auto" className={cn("block truncate text-[13px]", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
        {quote.snippet}
      </span>
    </button>
  );
}
