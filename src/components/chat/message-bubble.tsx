"use client";

import { Check, CheckCheck, Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeLabel, type UiMessage } from "./chat-utils";

/** One message. Mine sit on the start (right in RTL) in brand blue; theirs on the end, muted. */
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
  return (
    <div className={cn("flex animate-bubble-in", mine ? "justify-start" : "justify-end", grouped ? "mt-0.5" : "mt-3")}>
      <div className={cn("flex max-w-[82%] flex-col sm:max-w-[70%]", mine ? "items-start" : "items-end")}>
        <div
          className={cn(
            "whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-relaxed shadow-sm",
            mine
              ? "rounded-2xl rounded-es-md bg-primary text-primary-foreground"
              : "rounded-2xl rounded-ee-md border border-border/50 bg-card text-foreground",
            message.pending === "failed" && "opacity-70 ring-1 ring-destructive/40"
          )}
        >
          {message.body}
        </div>
        <div className="mt-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
          {message.pending === "sending" ? (
            <>
              <Clock className="h-3 w-3" /> جارٍ الإرسال
            </>
          ) : message.pending === "failed" ? (
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold text-destructive hover:underline">
              <RotateCcw className="h-3 w-3" /> لم تُرسل · إعادة المحاولة
            </button>
          ) : (
            <>
              <span>{timeLabel(message.createdAt)}</span>
              {mine &&
                (message.readAt ? (
                  <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label="تمت القراءة" />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-label="تم الإرسال" />
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
