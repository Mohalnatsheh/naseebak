"use client";

import { Check, CheckCheck, Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeLabel, type UiMessage } from "./chat-utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import { PhotoBubble, VoiceBubble } from "./media-bubble";

/** One message. Mine sit on the start (right in RTL) in brand blue; theirs on the end, white.
 * Time and read ticks sit inside the bubble, at its bottom corner. */
export function MessageBubble({
  message,
  grouped,
  onRetry,
}: {
  message: UiMessage;
  /** Same sender as the message before: tighter spacing */
  grouped: boolean;
  onRetry?: () => void;
}) {
  const mine = message.mine;
  const { country } = useDashboardData();
  // Photos and voice notes render as media; their `body` is only the fallback text for old apps
  const media = (message.kind === "IMAGE" || message.kind === "VOICE") && message.media ? message.media : null;
  const photo = !!media && message.kind === "IMAGE";
  return (
    <div className={cn("flex animate-bubble-in", mine ? "justify-start" : "justify-end", grouped ? "mt-1" : "mt-3")}>
      <div className={cn("flex max-w-[85%] flex-col sm:max-w-[70%]", mine ? "items-start" : "items-end")}>
        <div
          className={cn(
            "whitespace-pre-wrap break-words text-[15px] leading-relaxed shadow-sm",
            photo ? "p-1 pb-1.5" : "px-3 pb-1.5 pt-2",
            mine
              ? "rounded-2xl rounded-es-md bg-primary text-primary-foreground"
              : "rounded-2xl rounded-ee-md border border-border/50 bg-card text-foreground",
            message.pending === "failed" && "opacity-70 ring-1 ring-destructive/40"
          )}
        >
          {photo && media ? (
            <PhotoBubble media={media} mine={mine} sendFailed={message.pending === "failed"} />
          ) : media ? (
            <VoiceBubble media={media} mine={mine} />
          ) : (
            // Its own direction from its first letter: a Latin or mixed message keeps its punctuation in place
            <span dir="auto">{message.body}</span>
          )}
          <span
            className={cn(
              "float-end ms-3 mt-1.5 inline-flex translate-y-0.5 items-center gap-0.5 text-[11px] leading-none",
              photo && "me-1.5",
              mine ? "text-primary-foreground/70" : "text-muted-foreground"
            )}
          >
            {message.pending === "sending" ? (
              <Clock className="h-3 w-3" aria-label="جارٍ الإرسال" />
            ) : (
              <>
                <span>{timeLabel(message.createdAt, country)}</span>
                {mine && !message.pending &&
                  (message.readAt ? (
                    <CheckCheck className="h-3.5 w-3.5 text-accent" aria-label="تمت القراءة" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-label="تم الإرسال" />
                  ))}
              </>
            )}
          </span>
        </div>
        {message.pending === "failed" && (
          <button type="button" onClick={onRetry} className="mt-0.5 inline-flex min-h-9 items-center gap-1 px-1 text-xs font-semibold text-destructive hover:underline">
            <RotateCcw className="h-3 w-3" /> لم تُرسل · إعادة المحاولة
          </button>
        )}
      </div>
    </div>
  );
}
