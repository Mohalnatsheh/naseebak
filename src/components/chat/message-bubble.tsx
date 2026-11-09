"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeLabel, type UiMessage } from "./chat-utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import { PhotoBubble, VoiceBubble } from "./media-bubble";
import { MessageMenu, menuItemsFor, type MessageActions } from "./message-menu";
import { BubbleQuote } from "./reply-strip";
import { groupReactions } from "./chat-interactions";

/** A press this long on a touch screen opens the message menu */
const LONG_PRESS_MS = 450;
/** A finger that moves more than this is scrolling, not pressing */
const LONG_PRESS_SLOP_PX = 10;

/** One message. Mine sit on the start (right in RTL) in brand navy; theirs on the end, white.
 * The first bubble of a run carries a tail at its top corner (8 px above it); the rest of the run sits 2 px apart.
 * Time and read ticks sit inside the bubble, at its bottom corner (over the photo for a photo).
 * A reply shows its quote at the top (tap: scroll to the original); reactions sit as chips under the bubble's corner.
 * Hover (desktop) or a long press (phones) opens the message menu. */
export function MessageBubble({
  message,
  tail,
  onRetry,
  actions,
  partnerName = "",
  highlighted = false,
}: {
  message: UiMessage;
  /** First of a run from one sender (chatRowLayout) */
  tail: boolean;
  onRetry?: () => void;
  /** Reply, reactions, copy, report, quotes and the photo viewer; absent = a plain bubble */
  actions?: MessageActions;
  partnerName?: string;
  /** Briefly marked after a tap on a quote that points here */
  highlighted?: boolean;
}) {
  const mine = message.mine;
  const { country } = useDashboardData();
  // Photos and voice notes render as media; their `body` is only the fallback text for old apps
  const media = (message.kind === "IMAGE" || message.kind === "VOICE") && message.media ? message.media : null;
  const photo = !!media && message.kind === "IMAGE";
  const chips = groupReactions(message.reactions);

  const [menuOpen, setMenuOpen] = useState(false);
  const hasMenu = !!actions && Object.values(menuItemsFor(message, actions.canInteract)).some(Boolean);
  // Long press (touch): opens the menu; the click that follows the press is swallowed (no photo viewer, no play)
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const pressed = useRef(false);
  useEffect(() => () => {
    if (press.current) clearTimeout(press.current.timer);
  }, []);
  const clearPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };

  const time = (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] leading-none",
        photo
          ? "absolute bottom-2.5 end-2.5 rounded-full bg-black/45 px-1.5 py-1 text-white"
          : cn("float-end ms-3 mt-1.5 translate-y-0.5", mine ? "text-primary-foreground/70" : "text-muted-foreground")
      )}
    >
      {message.pending === "sending" ? (
        <Clock className="h-3 w-3" aria-label="جارٍ الإرسال" />
      ) : (
        <>
          <span>{timeLabel(message.createdAt, country)}</span>
          {mine && !message.pending &&
            (message.readAt ? (
              <CheckCheck className={cn("h-3.5 w-3.5", photo ? "text-white" : "text-accent")} aria-label="تمت القراءة" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-label="تم الإرسال" />
            ))}
        </>
      )}
    </span>
  );

  return (
    <div
      data-message-id={message.id}
      className={cn(
        "flex animate-bubble-in px-2 transition-colors duration-700",
        mine ? "justify-start" : "justify-end",
        tail ? "mt-2" : "mt-0.5",
        chips.length > 0 && "mb-3",
        highlighted && "bg-accent/20"
      )}
    >
      <div className={cn("flex max-w-[85%] flex-col sm:max-w-[70%]", mine ? "items-start" : "items-end")}>
        <div
          className={cn(
            "group/bubble relative whitespace-pre-wrap break-words rounded-xl text-[15px] leading-relaxed shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]",
            photo ? "p-1" : "px-2.5 pb-1.5 pt-1.5",
            mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
            tail && (mine ? "rounded-ss-none" : "rounded-se-none"),
            message.pending === "failed" && "opacity-70 ring-1 ring-destructive/40",
            highlighted && "ring-2 ring-accent",
            hasMenu && "pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]"
          )}
          onContextMenu={(e) => {
            if (!hasMenu) return;
            e.preventDefault();
            setMenuOpen(true);
          }}
          onPointerDown={(e) => {
            pressed.current = false;
            if (!hasMenu || e.pointerType === "mouse") return;
            clearPress();
            press.current = {
              x: e.clientX,
              y: e.clientY,
              timer: setTimeout(() => {
                press.current = null;
                pressed.current = true;
                navigator.vibrate?.(10);
                setMenuOpen(true);
              }, LONG_PRESS_MS),
            };
          }}
          onPointerMove={(e) => {
            const p = press.current;
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP_PX) clearPress();
          }}
          onPointerUp={clearPress}
          onPointerCancel={clearPress}
          onClickCapture={(e) => {
            if (!pressed.current) return;
            pressed.current = false;
            e.preventDefault();
            e.stopPropagation();
          }}
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
          {message.replyTo && (
            <BubbleQuote quote={message.replyTo} partnerName={partnerName} mine={mine} onOpen={actions?.onOpenQuote} />
          )}
          {photo && media ? (
            <div className="relative">
              <PhotoBubble
                media={media}
                mine={mine}
                sendFailed={message.pending === "failed"}
                onOpen={actions ? () => actions.onOpenPhoto(message.id) : undefined}
              />
              {time}
            </div>
          ) : media ? (
            <VoiceBubble media={media} mine={mine} messageId={message.id} />
          ) : (
            // Its own direction from its first letter: a Latin or mixed message keeps its punctuation in place
            <span dir="auto">{message.body}</span>
          )}
          {!photo && time}
          {hasMenu && actions && <MessageMenu message={message} actions={actions} open={menuOpen} onOpenChange={setMenuOpen} />}
          {chips.length > 0 && (
            <div className={cn("absolute -bottom-3.5 flex gap-1", mine ? "start-2" : "end-2")}>
              {chips.map((c) => (
                <button
                  key={c.emoji}
                  type="button"
                  disabled={!actions?.canInteract}
                  onClick={() => actions?.onReact(message, c.emoji)}
                  aria-label={`${c.emoji} ${c.count}${c.mine ? " · تفاعلك" : ""}`}
                  aria-pressed={c.mine}
                  className={cn(
                    "relative flex h-6 items-center gap-0.5 rounded-full border px-1.5 text-sm leading-none shadow-sm after:absolute after:-inset-2.5 after:content-[''] disabled:cursor-default",
                    c.mine ? "border-primary/30 bg-secondary" : "border-border/70 bg-card"
                  )}
                >
                  <span>{c.emoji}</span>
                  {c.count > 1 && <span className="text-[11px] font-semibold text-muted-foreground">{c.count}</span>}
                </button>
              ))}
            </div>
          )}
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
