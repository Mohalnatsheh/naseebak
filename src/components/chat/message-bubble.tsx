"use client";

import { Check, CheckCheck, Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeLabel, type UiMessage } from "./chat-utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import { PhotoBubble, VoiceBubble } from "./media-bubble";

/** One message. Mine sit on the start (right in RTL) in brand navy; theirs on the end, white.
 * The first bubble of a run carries a tail at its top corner (8 px above it); the rest of the run sits 2 px apart.
 * Time and read ticks sit inside the bubble, at its bottom corner. */
export function MessageBubble({
  message,
  tail,
  onRetry,
}: {
  message: UiMessage;
  /** First of a run from one sender (chatRowLayout) */
  tail: boolean;
  onRetry?: () => void;
}) {
  const mine = message.mine;
  const { country } = useDashboardData();
  // Photos and voice notes render as media; their `body` is only the fallback text for old apps
  const media = (message.kind === "IMAGE" || message.kind === "VOICE") && message.media ? message.media : null;
  const photo = !!media && message.kind === "IMAGE";
  return (
    <div
      data-message-id={message.id}
      className={cn("flex animate-bubble-in px-2", mine ? "justify-start" : "justify-end", tail ? "mt-2" : "mt-0.5")}
    >
      <div className={cn("flex max-w-[85%] flex-col sm:max-w-[70%]", mine ? "items-start" : "items-end")}>
        <div
          className={cn(
            "relative whitespace-pre-wrap break-words rounded-xl text-[15px] leading-relaxed shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]",
            photo ? "p-1 pb-1.5" : "px-2.5 pb-1.5 pt-1.5",
            mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
            tail && (mine ? "rounded-ss-none" : "rounded-se-none"),
            message.pending === "failed" && "opacity-70 ring-1 ring-destructive/40"
          )}
        >
          {tail && (
            // The tail: a small triangle out of the top corner on the sender's side (start for mine, end for theirs)
            <span
              aria-hidden
              data-testid="bubble-tail"
              className={cn(
                "absolute top-0 h-2.5 w-2",
                mine
                  ? "-start-2 bg-primary [clip-path:polygon(0_0,100%_0,0_100%)] ltr:[clip-path:polygon(0_0,100%_0,100%_100%)]"
                  : "-end-2 bg-card [clip-path:polygon(0_0,100%_0,100%_100%)] ltr:[clip-path:polygon(0_0,100%_0,0_100%)]"
              )}
            />
          )}
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
