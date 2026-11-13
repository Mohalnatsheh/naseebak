"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Check, CheckCheck, ChevronDown, CircleAlert, Clock, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeLabel, type UiMessage } from "./chat-utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import { PhotoBubble, VoiceBubble } from "./media-bubble";
import { menuItemsForActions, type MessageActions } from "./message-menu";
import { BubbleQuote } from "./reply-strip";
import { groupReactions } from "./chat-interactions";
import { DELETED_TRACE } from "@/lib/chat/visibility";
import { RowTabContext, rowAfterKey } from "./row-focus";
import { SWIPE_REPLY_PX, swipeReplyStep } from "./wa-chat-logic";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** A press this long on a touch screen selects the message */
const LONG_PRESS_MS = 450;
/** A finger that moves more than this is scrolling or swiping, not pressing */
const LONG_PRESS_SLOP_PX = 10;
/** How far the bubble follows the finger at most */
const SWIPE_MAX_PX = SWIPE_REPLY_PX + 16;

type Press = {
  x: number;
  y: number;
  rtl: boolean;
  /** False on the voice waveform (a drag there seeks) */
  swipe: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  step: "none" | "track" | "reply";
};

/**
 * One message in the WhatsApp-style layout (switch `chat_whatsapp_layout`). Mine: a pale navy bubble with ink text on
 * the end side (left in Arabic, as WhatsApp in Arabic); theirs: white on the start side. Classic keeps its own sides. A tail on the first of a run; time and ticks inside at the bottom end.
 * A long press (touch), right-click, the hover chevron (desktop) or Enter on the row selects the message (`onSelect`:
 * the room shows the selection bar); there is no per-bubble menu. A touch swipe inward replies; on desktop a reply
 * arrow shows on hover. Reactions sit in one pill at the bottom end edge (tap: `onReactionsTap`).
 */
export function WaMessageBubble({
  message,
  tail,
  partnerName,
  actions,
  selected,
  highlighted,
  rowActive,
  onRowFocus,
  onSelect,
  onRetry,
  onDismissFailed,
  onReactionsTap,
}: {
  message: UiMessage;
  /** First of a run from one sender (chatRowLayout) */
  tail: boolean;
  partnerName: string;
  /** Reply, reactions, quotes and the photo viewer; absent = a plain bubble */
  actions?: MessageActions;
  /** The selected message: a full-row wash */
  selected: boolean;
  /** Briefly marked after a tap on a quote that points here */
  highlighted: boolean;
  /** Roving focus: undefined = none; true = this row is the list's Tab stop; false = out of the Tab order */
  rowActive?: boolean;
  onRowFocus?: (id: string) => void;
  /** Long press, right-click, the hover chevron, Enter / the menu key on the row */
  onSelect: (m: UiMessage) => void;
  onRetry: () => void;
  onDismissFailed: () => void;
  /** The reaction pill */
  onReactionsTap: (m: UiMessage) => void;
}) {
  const mine = message.mine;
  const { country } = useDashboardData();
  const deleted = !!message.deleted;
  const media = !deleted && (message.kind === "IMAGE" || message.kind === "VOICE") && message.media ? message.media : null;
  const photo = !!media && message.kind === "IMAGE";
  const failed = message.pending === "failed";
  const chips = deleted ? [] : groupReactions(message.reactions);
  const reactionCount = chips.reduce((n, c) => n + c.count, 0);
  const rowTab = rowActive === false ? -1 : undefined;

  const items = actions ? menuItemsForActions(message, actions) : null;
  const selectable = !!items && Object.values(items).some(Boolean);
  const canReply = !!items?.reply;

  // Long press and swipe (touch only); the click after a long press or a swipe is swallowed
  const press = useRef<Press | null>(null);
  const swallowClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [replyReady, setReplyReady] = useState(false);
  useEffect(
    () => () => {
      if (press.current?.timer) clearTimeout(press.current.timer);
    },
    []
  );
  const stopTimer = () => {
    if (press.current?.timer) clearTimeout(press.current.timer);
    if (press.current) press.current.timer = null;
  };
  const endPress = () => {
    const p = press.current;
    stopTimer();
    press.current = null;
    if (p?.step === "reply" && actions) actions.onReply(message);
    setOffset(0);
    setReplyReady(false);
  };

  const time = (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-caption leading-none",
        photo
          ? "absolute bottom-2.5 end-2.5 rounded-full bg-black/45 px-1.5 py-1 text-white"
          : "float-end ms-3 mt-1.5 translate-y-0.5 text-muted-foreground"
      )}
    >
      {message.pending === "sending" ? (
        <Clock className="h-3 w-3" aria-label="جارٍ الإرسال" />
      ) : (
        <>
          <span>{timeLabel(message.createdAt, country)}</span>
          {mine && !message.pending &&
            (message.readAt ? (
              <CheckCheck className={cn("h-3.5 w-3.5", photo ? "text-white" : "text-primary")} aria-label="تمت القراءة" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-label="تم الإرسال" />
            ))}
        </>
      )}
    </span>
  );

  // Beside the bubble, towards the middle of the screen: the failed-send ⓘ and the desktop reply arrow
  const side = (
    <div className="flex shrink-0 items-center self-center">
      {failed && (
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              tabIndex={rowTab}
              aria-label="لم تُرسل"
              className="flex size-11 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
            >
              <CircleAlert className="h-5 w-5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={mine ? "end" : "start"}>
            <DropdownMenuItem className="min-h-11" onSelect={onRetry}>
              إعادة المحاولة
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 text-destructive focus:text-destructive" onSelect={onDismissFailed}>
              حذف
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canReply && actions && (
        <button
          type="button"
          tabIndex={rowTab}
          aria-label="رد"
          onClick={() => actions.onReply(message)}
          className="flex size-11 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover/row:opacity-100 motion-reduce:transition-none pointer-coarse:hidden"
        >
          <Reply className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );

  const roving = rowActive !== undefined;
  return (
    <RowTabContext.Provider value={roving && !rowActive ? -1 : undefined}>
      <div
        data-message-id={message.id}
        aria-current={selected ? "true" : undefined}
        {...(selected && { "data-selected": "" })}
        {...(roving && {
          "data-message-row": "",
          tabIndex: rowActive ? 0 : -1,
          onFocus: () => onRowFocus?.(message.id),
          onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.target !== e.currentTarget) return;
            const next = rowAfterKey(e.currentTarget, e.key);
            if (next) {
              e.preventDefault();
              next.focus();
              next.scrollIntoView({ block: "nearest" });
            } else if (selectable && (e.key === "Enter" || e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) {
              e.preventDefault();
              onSelect(message);
            }
          },
        })}
        className={cn(
          "group/row flex animate-bubble-in px-2 transition-colors duration-700 outline-none focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 motion-reduce:transition-none",
          mine ? "justify-end" : "justify-start",
          tail ? "mt-2" : "mt-0.5",
          chips.length > 0 && "mb-3",
          highlighted && "bg-accent/20",
          selected && "bg-chat-select duration-0"
        )}
      >
        <div className={cn("flex max-w-[85%] items-start sm:max-w-[70%]", mine && "flex-row-reverse")}>
          <div
            data-wa-bubble=""
            style={offset ? { transform: `translateX(${offset}px)` } : undefined}
            className={cn(
              "group/bubble relative min-w-0 whitespace-pre-wrap break-words rounded-xl text-[15px] leading-relaxed text-foreground shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]",
              photo ? "p-1" : "px-2.5 pb-1.5 pt-1.5",
              mine ? "bg-bubble-mine" : "bg-card",
              tail && (mine ? "rounded-se-none" : "rounded-ss-none"),
              failed && "opacity-70 ring-1 ring-destructive/40",
              highlighted && "ring-2 ring-accent",
              !offset && "transition-transform duration-200 motion-reduce:transition-none",
              selectable && "pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]",
              canReply && "touch-pan-y"
            )}
            onContextMenu={(e) => {
              if (!selectable) return;
              e.preventDefault();
              // Android fires contextmenu on a touch long press too: the press's own timer selects (once)
              if (press.current || swallowClick.current) return;
              onSelect(message);
            }}
            onPointerDown={(e) => {
              swallowClick.current = false;
              if (e.pointerType === "mouse" || (!selectable && !canReply)) return;
              stopTimer();
              const el = e.currentTarget;
              const rtl =
                (typeof getComputedStyle === "function" && getComputedStyle(el).direction === "rtl") ||
                el.closest("[dir]")?.getAttribute("dir") === "rtl";
              press.current = {
                x: e.clientX,
                y: e.clientY,
                rtl,
                swipe: canReply && !(e.target as Element).closest?.('[role="slider"]'),
                step: "none",
                timer: selectable
                  ? setTimeout(() => {
                      if (press.current) press.current.timer = null;
                      press.current = null;
                      swallowClick.current = true;
                      navigator.vibrate?.(10);
                      onSelect(message);
                    }, LONG_PRESS_MS)
                  : null,
              };
            }}
            onPointerMove={(e) => {
              const p = press.current;
              if (!p) return;
              const dx = e.clientX - p.x;
              const dy = e.clientY - p.y;
              // A few px of wobble during a tap is neither a swipe nor a reason to eat the click
              if (Math.hypot(dx, dy) <= LONG_PRESS_SLOP_PX) {
                if (p.step !== "none") {
                  // dragged back to where it began: no reply on release
                  p.step = "none";
                  setOffset(0);
                  setReplyReady(false);
                }
                return;
              }
              stopTimer();
              if (!p.swipe) return;
              const step = swipeReplyStep({ dx, dy, rtl: p.rtl, side: mine ? "end" : "start" });
              p.step = step;
              if (step === "none") {
                setOffset(0);
                setReplyReady(false);
                return;
              }
              swallowClick.current = true;
              setOffset(Math.sign(dx) * Math.min(Math.abs(dx), SWIPE_MAX_PX));
              setReplyReady(step === "reply");
            }}
            onPointerUp={endPress}
            onPointerCancel={() => {
              if (press.current) press.current.step = "none";
              endPress();
            }}
            onClickCapture={(e) => {
              if (!swallowClick.current) return;
              swallowClick.current = false;
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {replyReady && (
              <span
                aria-hidden
                data-testid="swipe-reply"
                // in the space the bubble left behind (a physical side: the offset is physical too)
                style={offset < 0 ? { right: -40 } : { left: -40 }}
                className="absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-card text-primary shadow-sm"
              >
                <Reply className="h-4 w-4" />
              </span>
            )}
            {tail && (
              <span
                aria-hidden
                data-testid="bubble-tail"
                className={cn(
                  "absolute top-0 h-2.5 w-2",
                  mine
                    ? "-end-2 bg-bubble-mine [clip-path:polygon(0_0,100%_0,100%_100%)] ltr:[clip-path:polygon(0_0,100%_0,0_100%)]"
                    : "-start-2 bg-card [clip-path:polygon(0_0,100%_0,0_100%)] ltr:[clip-path:polygon(0_0,100%_0,100%_100%)]"
                )}
              />
            )}
            {selectable && (
              <button
                type="button"
                tabIndex={rowTab}
                aria-label="خيارات الرسالة"
                onClick={() => onSelect(message)}
                className={cn(
                  "absolute start-0 top-0 z-10 flex size-11 items-start justify-start rounded-xl p-1 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/bubble:opacity-100 motion-reduce:transition-none pointer-coarse:hidden",
                  photo && "text-white"
                )}
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            )}
            <span className="sr-only">{mine ? "أنت:" : partnerName ? `${partnerName}:` : ""} </span>
            {message.replyTo && !deleted && (
              <BubbleQuote
                quote={message.replyTo}
                partnerName={partnerName}
                mine={false}
                onOpen={actions?.onOpenQuote}
                className={mine ? "bg-bubble-mine-quote hover:bg-bubble-mine-quote" : undefined}
              />
            )}
            {photo && media ? (
              <div className="relative">
                <PhotoBubble
                  media={media}
                  mine={false}
                  sendFailed={failed}
                  onOpen={actions ? () => actions.onOpenPhoto(message.id) : undefined}
                />
                {time}
              </div>
            ) : media ? (
              <VoiceBubble media={media} mine={mine} messageId={message.id} onNavy={false} rememberSpeed />
            ) : deleted ? (
              <span data-testid="deleted-trace" className="inline-flex items-center gap-1 italic text-muted-foreground">
                <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {DELETED_TRACE}
              </span>
            ) : (
              <span dir="auto">{message.body}</span>
            )}
            {!photo && time}
            {chips.length > 0 && (
              <button
                type="button"
                data-testid="reaction-pill"
                tabIndex={rowTab}
                onClick={() => onReactionsTap(message)}
                aria-label={`التفاعلات: ${chips.map((c) => c.emoji).join(" ")}${reactionCount > 1 ? ` · ${reactionCount}` : ""}`}
                className="absolute -bottom-3.5 end-2 flex h-6 items-center gap-0.5 rounded-full border border-border/70 bg-card px-1.5 text-sm leading-none shadow-sm after:absolute after:-inset-2.5 after:content-['']"
              >
                {chips.map((c) => (
                  <span key={c.emoji}>{c.emoji}</span>
                ))}
                {reactionCount > 1 && <span className="ms-0.5 text-caption font-semibold text-muted-foreground">{reactionCount}</span>}
              </button>
            )}
          </div>
          {side}
        </div>
      </div>
    </RowTabContext.Provider>
  );
}
