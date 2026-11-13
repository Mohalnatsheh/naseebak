"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { ChevronRight, ChevronUp, Loader2, Lock, Mic, SendHorizontal, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReplyQuote } from "@/lib/chat/reply";
import { MAX_RECORD_SEC } from "./voice-recorder";
import { PhotoButton, ProLock, clockLabel, type ComposerMedia } from "./media-buttons";
import { useHoldToRecord } from "./use-hold-to-record";
import { ReplyStrip } from "./reply-strip";
import { StarterChips } from "./starter-chips";
import { LiveLevel } from "./live-level";

const MAX = 1000;

export interface ChatComposerHandle {
  /** Put text in the box; `onlyIfEmpty` leaves whatever the member is already typing alone */
  fill: (text: string, opts?: { onlyIfEmpty?: boolean }) => void;
  focus: () => void;
}

/**
 * The composer: a pill-shaped box (the photo button inside, at its end) and one round button beside it — the mic
 * while the box is empty, send once there is text. Enter sends, Shift+Enter adds a line.
 *
 * Hold to record (pointer events, the same on touch and mouse): press and hold the mic; release sends; slide towards
 * the start edge to cancel («اسحب للإلغاء»); slide up to lock (stop / cancel / send). A lost press (pointercancel, the
 * pointer leaving, a second finger) or a hidden tab stops the recording and waits — never a silent send. A keyboard
 * press (a click with no pointer press) records hands-free.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, {
  onSend: (text: string) => Promise<boolean>;
  error: string | null;
  onTyping: () => void;
  /** Viewer is a woman: feminine placeholder */
  female?: boolean;
  /** Phone keyboard is up: drop the home-indicator padding */
  keyboardOpen?: boolean;
  /** Photo and voice buttons (Pro); absent = hidden */
  media?: ComposerMedia;
  /** Replying to this message (the strip above the box) */
  replyTo?: ReplyQuote | null;
  partnerName?: string;
  onCancelReply?: () => void;
  /** Conversation starters (shown while the box is empty) */
  starters?: readonly string[];
}>(function ChatComposer({ onSend, error, onTyping, female, keyboardOpen, media, replyTo, partnerName = "", onCancelReply, starters = [] }, ref) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const micHintId = useId();
  const rec = useHoldToRecord(media, { female, onError: setHint, textRef: area });
  const { voice, phase, holding, recordingView, stoppedView, busyVoice, elapsed, stopReason, slide, said, roundButton } = rec;
  // The mic takes the send button's place while the box is empty (one round button at the end)
  const showMic = !!media && !text.trim() && !busyVoice;

  useImperativeHandle(ref, () => ({
    fill: (t: string, opts?: { onlyIfEmpty?: boolean }) => {
      setText((current) => (opts?.onlyIfEmpty && current.trim() ? current : t));
      requestAnimationFrame(() => area.current?.focus());
    },
    focus: () => area.current?.focus(),
  }));

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  // A hint fades by itself
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 3500);
    return () => clearTimeout(t);
  }, [hint]);

  /** Esc: cancel a recording, else drop the reply (QA WC2-10) */
  function onComposerKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
    if (busyVoice || phase === "starting") {
      e.preventDefault();
      rec.escape();
    } else if (replyTo && onCancelReply) {
      e.preventDefault();
      onCancelReply();
      area.current?.focus();
    }
  }

  async function submit() {
    const value = text.trim();
    if (!value || sending || value.length > MAX) return;
    setSending(true);
    let ok = false;
    try {
      ok = await onSend(value);
    } catch {
      // An error on this device: the text stays in the box to send again, and the spinner never stays on forever
    }
    setSending(false);
    if (ok) setText("");
    area.current?.focus();
  }

  function onRoundClick(e: React.MouseEvent) {
    if (rec.roundClick(e, showMic)) return;
    void submit();
  }

  const clock = (
    <span dir="ltr" className="font-mono text-sm tabular-nums text-foreground">
      {clockLabel(elapsed)}
      {(recordingView || stoppedView) && <span className="text-muted-foreground"> / {clockLabel(MAX_RECORD_SEC)}</span>}
    </span>
  );
  return (
    <div
      onKeyDown={onComposerKey}
      className={cn(
        "relative border-t border-border/60 bg-card/95 px-2.5 pt-2 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-3",
        keyboardOpen ? "pb-2" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      )}
    >
      <span role="status" className="sr-only">
        {said}
      </span>
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {hint && (
        <p role="status" className="mb-2 rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {!busyVoice && !text.trim() && !keyboardOpen && <StarterChips starters={starters} onPick={(s) => {
        setText(s);
        requestAnimationFrame(() => area.current?.focus());
      }} />}
      {/* Stays while recording: the voice note goes as this reply */}
      {replyTo && <ReplyStrip quote={replyTo} partnerName={partnerName} onClose={() => onCancelReply?.()} />}
      <div className="flex items-end gap-2">
        <div
          className={cn(
            "flex min-h-11 min-w-0 flex-1 items-end rounded-3xl border bg-background transition-shadow",
            busyVoice ? "border-input" : "border-input focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15"
          )}
        >
          {holding ? (
            <div className="flex min-h-11 flex-1 items-center gap-2 overflow-hidden px-3">
              <span className="h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden />
              {clock}
              <span
                className="ms-auto flex items-center gap-0.5 whitespace-nowrap text-sm text-muted-foreground transition-transform"
                style={{ transform: `translateX(${slide}px)` }}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
                اسحب للإلغاء
              </span>
            </div>
          ) : recordingView || stoppedView ? (
            <div className="flex min-h-11 flex-1 items-center gap-1.5 ps-1 pe-1">
              <button
                type="button"
                onClick={rec.cancelRecording}
                aria-label="إلغاء التسجيل"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-5 w-5" aria-hidden />
              </button>
              {recordingView ? (
                <>
                  <span className="h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden />
                  {clock}
                  <LiveLevel stream={voice.stream} className="mx-1 min-w-0 flex-1" />
                  <button
                    type="button"
                    onClick={rec.stopByHand}
                    aria-label="إيقاف التسجيل"
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                  >
                    <Square className="h-4 w-4 fill-current" aria-hidden />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {stopReason === "limit" ? "بلغ التسجيل الحد الأقصى" : "توقف التسجيل · جاهز للإرسال"}
                  </span>
                  <span className="pe-2">{clock}</span>
                </>
              )}
            </div>
          ) : (
            <>
              <textarea
                id="chat-composer"
                ref={area}
                value={text}
                rows={1}
                dir="auto"
                maxLength={MAX + 50}
                enterKeyHint="send"
                aria-label={female ? "اكتبي رسالتكِ" : "اكتب رسالتك"}
                placeholder={female ? "اكتبي رسالتكِ…" : "اكتب رسالتك…"}
                onChange={(e) => {
                  setText(e.target.value);
                  onTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                className="max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 ps-4 pe-1 text-base leading-relaxed outline-none"
              />
              {media && <PhotoButton media={media} tagOnMic={showMic} />}
            </>
          )}
        </div>

        {/* One round button: mic (hold to record) while the box is empty, send once there is text or a note */}
        <div className="relative flex-shrink-0">
          {holding && (
            // Slide up to lock
            <div aria-hidden className="pointer-events-none absolute bottom-full start-1/2 mb-3 flex -translate-x-1/2 flex-col items-center gap-0.5 rounded-full bg-card px-2 py-2 text-muted-foreground shadow-md ring-1 ring-border/60 rtl:translate-x-1/2">
              <Lock className="h-4 w-4" />
              <ChevronUp className="h-4 w-4 animate-bounce" />
            </div>
          )}
          <button
            ref={roundButton}
            type="button"
            onClick={onRoundClick}
            onPointerDown={(e) => rec.roundPointerDown(e, showMic)}
            onPointerMove={rec.moveHold}
            onPointerUp={rec.releaseHold}
            onPointerCancel={rec.loseHold}
            onLostPointerCapture={rec.loseHold}
            onPointerLeave={rec.loseHold}
            onContextMenu={(e) => showMic && e.preventDefault()}
            // Never disabled under a held press (a disabled button gets no pointer events: the release would be lost)
            disabled={busyVoice ? phase === "stopping" : !showMic && (!text.trim() || sending || text.trim().length > MAX)}
            aria-label={
              busyVoice && !holding
                ? "إرسال الرسالة الصوتية"
                : showMic || holding
                  ? media?.mode === "locked"
                    ? "تسجيل رسالة صوتية · متاح لأعضاء Pro"
                    : "تسجيل رسالة صوتية"
                  : "إرسال"
            }
            // How to record, for keyboards and screen readers too (QA PA-L3): Enter records hands-free
            aria-describedby={showMic && media?.mode === "enabled" ? micHintId : undefined}
            className={cn(
              "relative flex h-11 w-11 touch-none select-none items-center justify-center rounded-full transition-all [-webkit-touch-callout:none] disabled:opacity-40",
              showMic && media?.mode === "locked"
                ? "bg-muted text-muted-foreground/60 hover:bg-muted/80"
                : "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90",
              holding ? "scale-125" : "active:scale-95"
            )}
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (showMic || holding) ? (
              <Mic className="h-5 w-5" aria-hidden />
            ) : (
              <SendHorizontal className="h-5 w-5 -scale-x-100" aria-hidden />
            )}
            {showMic && media?.mode === "locked" && <ProLock />}
          </button>
          <span id={micHintId} className="sr-only">
            {female
              ? "اضغطي مطولاً للتسجيل وارفعي إصبعكِ للإرسال، أو اضغطي Enter للتسجيل ثم الإرسال، وEsc للإلغاء"
              : "اضغط مطولاً للتسجيل وارفع إصبعك للإرسال، أو اضغط Enter للتسجيل ثم الإرسال، وEsc للإلغاء"}
          </span>
        </div>
      </div>
      {!busyVoice && text.length > 800 && (
        <p className={cn("mt-1 px-2 text-xs", text.length > MAX ? "text-destructive" : "text-muted-foreground")}>
          {text.length} / {MAX}
        </p>
      )}
    </div>
  );
});
