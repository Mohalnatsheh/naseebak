"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronRight, ChevronUp, Loader2, Lock, Mic, SendHorizontal, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReplyQuote } from "@/lib/chat/reply";
import { MAX_RECORD_SEC } from "./voice-recorder";
import { PhotoButton, ProTag, clockLabel, useVoiceRecording, type ComposerMedia } from "./media-buttons";
import { holdGesture } from "./chat-interactions";
import { ReplyStrip } from "./reply-strip";
import { StarterChips } from "./starter-chips";
import { LiveLevel } from "./live-level";

const MAX = 1000;

export interface ChatComposerHandle {
  /** Put text in the box; `onlyIfEmpty` leaves whatever the member is already typing alone */
  fill: (text: string, opts?: { onlyIfEmpty?: boolean }) => void;
  focus: () => void;
}

/** A press on the mic: where it went down, and in which direction the page reads */
type Hold = { id: number; x: number; y: number; rtl: boolean };

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
  const voice = useVoiceRecording(media);
  const phase = voice.state.phase;

  // The press on the mic (null once released, cancelled, locked or lost) and the slide shown under the finger
  const hold = useRef<Hold | null>(null);
  const [holdDx, setHoldDx] = useState<number | null>(null);
  // The click that ends a press is not a tap on whatever the button became meanwhile (send, after locking); cleared
  // by the next press elsewhere on the button. A keyboard click (detail 0) is never swallowed
  const swallowClick = useRef(false);
  // Locked while the microphone prompt was still open: keep recording once it starts
  const lockedDuringStart = useRef(false);
  // Released before recording began (a tap): a hint, not an error
  const releasedEarly = useRef(false);

  const holding = holdDx !== null && (phase === "starting" || phase === "recording");
  const recordingView = phase === "recording" && !holding;
  const stoppedView = phase === "stopping" || phase === "stopped";
  const busyVoice = holding || recordingView || stoppedView;
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

  /** The press is over (whatever happens to the recording) */
  function endHold() {
    hold.current = null;
    setHoldDx(null);
  }

  /** The press was lost without a release: stop and wait, or give the microphone back if it hadn't started */
  function loseHold() {
    if (!hold.current) return;
    endHold();
    if (phase === "recording") void voice.pause("interrupted");
  }

  // A second finger (or another pointer) anywhere while holding: the press is no longer clear
  useEffect(() => {
    if (holdDx === null) return;
    const onDown = (e: PointerEvent) => {
      if (hold.current && e.pointerId !== hold.current.id) loseHold();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  });

  function startHold(e: React.PointerEvent<HTMLButtonElement>) {
    if (!media || media.mode !== "enabled" || phase !== "idle") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault(); // no focus / text selection under a held finger
    swallowClick.current = true;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // not capturable (already released): pointerleave covers it
    }
    const rtl = getComputedStyle(e.currentTarget).direction !== "ltr";
    hold.current = { id: e.pointerId, x: e.clientX, y: e.clientY, rtl };
    setHoldDx(0);
    setHint(null);
    void voice.start({ keep: () => hold.current !== null || lockedDuringStart.current }).then((ok) => {
      if (!ok && releasedEarly.current) setHint(female ? "اضغطي مطولاً للتسجيل، وارفعي إصبعكِ للإرسال" : "اضغط مطولاً للتسجيل، وارفع إصبعك للإرسال");
      releasedEarly.current = false;
      lockedDuringStart.current = false;
    });
  }
  function moveHold(e: React.PointerEvent<HTMLButtonElement>) {
    const h = hold.current;
    if (!h || e.pointerId !== h.id) return;
    const dx = e.clientX - h.x;
    const step = holdGesture({ dx, dy: e.clientY - h.y, rtl: h.rtl });
    if (step === "cancel") {
      endHold();
      voice.cancel();
    } else if (step === "lock") {
      if (phase === "starting") lockedDuringStart.current = true;
      endHold();
    } else {
      setHoldDx(dx);
    }
  }

  function releaseHold(e: React.PointerEvent<HTMLButtonElement>) {
    const h = hold.current;
    if (!h || e.pointerId !== h.id) return;
    endHold();
    if (phase === "recording") void voice.send();
    else if (phase === "starting") releasedEarly.current = true;
  }

  async function submit() {
    const value = text.trim();
    if (!value || sending || value.length > MAX) return;
    setSending(true);
    const ok = await onSend(value);
    setSending(false);
    if (ok) setText("");
    area.current?.focus();
  }

  function onRoundClick(e: React.MouseEvent) {
    if (swallowClick.current && e.detail > 0) {
      swallowClick.current = false;
      return;
    }
    if (busyVoice) return void voice.send();
    if (showMic && media) {
      if (media.mode === "locked") return media.onLocked();
      // Keyboard / assistive tech (a click with no press): record hands-free, then stop / cancel / send
      return void voice.start();
    }
    void submit();
  }

  const elapsed = "elapsed" in voice.state ? voice.state.elapsed : 0;
  const stopReason = voice.state.phase === "stopping" || voice.state.phase === "stopped" ? voice.state.reason : null;
  const clock = (
    <span dir="ltr" className="font-mono text-sm tabular-nums text-foreground">
      {clockLabel(elapsed)}
      {(recordingView || stoppedView) && <span className="text-muted-foreground"> / {clockLabel(MAX_RECORD_SEC)}</span>}
    </span>
  );
  // Slide-to-cancel follows the finger a little (towards the start edge only)
  const slide = holdDx === null ? 0 : Math.max(-120, Math.min(120, holdDx));

  return (
    <div
      className={cn(
        "relative border-t border-border/60 bg-card/95 px-2.5 pt-2 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-3",
        keyboardOpen ? "pb-2" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      )}
    >
      {error && <p className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {hint && (
        <p role="status" className="mb-2 rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {!busyVoice && !text.trim() && !keyboardOpen && <StarterChips starters={starters} onPick={(s) => {
        setText(s);
        requestAnimationFrame(() => area.current?.focus());
      }} />}
      {replyTo && !busyVoice && <ReplyStrip quote={replyTo} partnerName={partnerName} onClose={() => onCancelReply?.()} />}
      <div className="flex items-end gap-2">
        <div
          className={cn(
            "flex min-h-11 min-w-0 flex-1 items-end rounded-3xl border bg-background transition-shadow",
            busyVoice ? "border-input" : "border-input focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15"
          )}
        >
          {holding ? (
            <div className="flex min-h-11 flex-1 items-center gap-2 overflow-hidden px-3" role="status" aria-live="polite">
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
            <div className="flex min-h-11 flex-1 items-center gap-1.5 ps-1 pe-1" role="status">
              <button
                type="button"
                onClick={voice.cancel}
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
                    onClick={() => void voice.pause("manual")}
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
              {media && <PhotoButton media={media} />}
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
            type="button"
            onClick={onRoundClick}
            onPointerDown={(e) => {
              if (showMic) return startHold(e);
              swallowClick.current = false;
              // Keep the focus in the box so the phone keyboard stays open between messages
              e.preventDefault();
            }}
            onPointerMove={moveHold}
            onPointerUp={releaseHold}
            onPointerCancel={loseHold}
            onLostPointerCapture={loseHold}
            onPointerLeave={loseHold}
            onContextMenu={(e) => showMic && e.preventDefault()}
            // Never disabled under a held press (a disabled button gets no pointer events: the release would be lost)
            disabled={busyVoice ? phase === "stopping" : !showMic && (!text.trim() || sending || text.trim().length > MAX)}
            aria-label={
              busyVoice && !holding
                ? "إرسال الرسالة الصوتية"
                : showMic || holding
                  ? media?.mode === "locked"
                    ? "تسجيل رسالة صوتية · متاح لأعضاء Pro"
                    : "تسجيل رسالة صوتية (اضغط مطولاً)"
                  : "إرسال"
            }
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
            {showMic && media?.mode === "locked" && <ProTag />}
          </button>
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
