"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Camera, ChevronRight, ChevronUp, ImageIcon, Keyboard, Loader2, Lock, Mic, Paperclip, SendHorizontal, Smile, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MAX_RECORD_SEC } from "./voice-recorder";
import { ProLock, clockLabel } from "./media-buttons";
import { useHoldToRecord } from "./use-hold-to-record";
import { quoteAuthor } from "./reply-strip";
import { StarterChips } from "./starter-chips";
import { LiveLevel } from "./live-level";
import { enterSends } from "./wa-chat-logic";
import type { ChatComposer, ChatComposerHandle } from "./chat-composer";

/** While the panel's chunk loads: a muted box the panel's size (its container sets the size) */
function EmojiPanelLoading() {
  return (
    <div role="status" data-testid="emoji-panel-loading" className="h-full w-full animate-pulse bg-muted/60 motion-reduce:animate-none">
      <span className="sr-only">جارٍ التحميل…</span>
    </div>
  );
}

const EmojiPanel = dynamic(() => import("./emoji-panel").then((m) => m.EmojiPanel), { ssr: false, loading: EmojiPanelLoading });

const MAX = 1000;
/** The text box grows to about 6 lines, then scrolls */
const MAX_BOX_PX = 160;
/** The mic hint stays this long in the error line */
const HINT_MS = 4000;

const COARSE = "(pointer: coarse)";
const isCoarse = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(COARSE).matches;
function subscribeCoarse(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(COARSE);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}
/** A phone or tablet (touch first): the camera button, Enter adds a line, the emoji panel replaces the keyboard */
function useCoarsePointer() {
  return useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
}

const ICON_BUTTON = "relative flex size-11 flex-shrink-0 items-center justify-center rounded-full transition-colors motion-reduce:transition-none";

/**
 * The WhatsApp-style composer (switch `chat_whatsapp_layout`): one white card (the reply strip on top, then the pill:
 * emoji, text, paperclip, camera) and one round navy button outside it, the mic while empty and send once there is
 * text. Hold to record is `useHoldToRecord`, shared with the classic composer. Same props and handle as `ChatComposer`.
 */
export const WaComposer = forwardRef<ChatComposerHandle, React.ComponentPropsWithoutRef<typeof ChatComposer>>(function WaComposer(
  { onSend, error, onTyping, female, keyboardOpen, media, replyTo, partnerName = "", onCancelReply, starters = [] },
  ref
) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  // Where the next emoji goes while the box is blurred (the phone panel is open): reading or setting the box's own
  // selection then would focus it on iOS Safari, raise the keyboard and close the panel
  const insertAt = useRef<number | null>(null);
  const micHintId = useId();
  const coarse = useCoarsePointer();
  const rec = useHoldToRecord(media, { female, onError: setHint, textRef: area, permissionHint: true });
  const { voice, phase, holding, recordingView, stoppedView, busyVoice, elapsed, stopReason, slide, said, roundButton } = rec;
  const showMic = !!media && !text.trim() && !busyVoice;
  const locked = media?.mode === "locked";

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
    el.style.height = `${Math.min(el.scrollHeight, MAX_BOX_PX)}px`;
  }, [text]);

  // A picked emoji leaves the cursor right after it: in the box when it has the focus, else remembered for the next pick
  useLayoutEffect(() => {
    if (caret.current === null) return;
    const el = area.current;
    if (el && typeof document !== "undefined" && document.activeElement === el) {
      el.setSelectionRange(caret.current, caret.current);
      insertAt.current = null;
    } else {
      insertAt.current = caret.current;
    }
    caret.current = null;
  }, [text]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), HINT_MS);
    return () => clearTimeout(t);
  }, [hint]);

  // The desktop popover closes on a press anywhere outside the composer
  useEffect(() => {
    if (!emojiOpen || coarse) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [emojiOpen, coarse]);

  function insertEmoji(emoji: string) {
    const el = area.current;
    const focused = !!el && typeof document !== "undefined" && document.activeElement === el;
    const remembered = !focused && insertAt.current !== null ? Math.min(insertAt.current, text.length) : null;
    const start = remembered ?? el?.selectionStart ?? text.length;
    const end = remembered ?? el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    if (next.length > MAX + 50) return;
    caret.current = start + emoji.length;
    setText(next);
    onTyping();
  }

  /** Phones: the panel takes the keyboard's place and back. Desktop: a popover; the focus stays in the box */
  function toggleEmoji() {
    if (emojiOpen) {
      setEmojiOpen(false);
      area.current?.focus();
      return;
    }
    if (coarse) area.current?.blur();
    setEmojiOpen(true);
  }

  /** Esc: cancel a recording, else close the emoji panel, else drop the reply */
  function onComposerKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
    if (busyVoice || phase === "starting") {
      e.preventDefault();
      rec.escape();
    } else if (emojiOpen) {
      e.preventDefault();
      setEmojiOpen(false);
      area.current?.focus();
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
    if (!(coarse && emojiOpen)) area.current?.focus();
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same photo can be picked again
    if (file) media?.onPhoto(file);
  }

  const clock = (
    <span dir="ltr" className="font-mono text-sm tabular-nums text-foreground">
      {clockLabel(elapsed)}
      {(recordingView || stoppedView) && <span className="text-muted-foreground"> / {clockLabel(MAX_RECORD_SEC)}</span>}
    </span>
  );
  const panel = emojiOpen && !busyVoice;

  return (
    <div
      ref={root}
      onKeyDown={onComposerKey}
      className={cn("relative px-2 pt-1.5", keyboardOpen || (panel && coarse) ? "pb-2" : "pb-[max(0.5rem,env(safe-area-inset-bottom))]")}
    >
      <span role="status" className="sr-only">
        {said}
      </span>
      {error ? (
        <p role="alert" className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p role="status" className="mb-2 rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {!busyVoice && !text.trim() && !keyboardOpen && !panel && (
        <StarterChips
          starters={starters}
          onPick={(s) => {
            setText(s);
            requestAnimationFrame(() => area.current?.focus());
          }}
        />
      )}
      {panel && !coarse && (
        <div className="absolute bottom-full start-2 z-20 mb-1 h-72 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl shadow-lg ring-1 ring-border/60">
          <EmojiPanel onPick={insertEmoji} className="h-full" />
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <div className="flex min-w-0 flex-1 flex-col rounded-3xl bg-card shadow-sm ring-1 ring-border/50">
          {/* Stays while recording: the voice note goes as this reply */}
          {replyTo && (
            <div data-testid="reply-strip" className="m-1.5 mb-0 flex items-center gap-1 overflow-hidden rounded-2xl bg-muted/70">
              <div className="min-w-0 flex-1 border-s-4 border-accent py-1.5 ps-2.5">
                <p className="truncate text-xs font-bold text-accent-ink">{quoteAuthor(replyTo, partnerName)}</p>
                <p dir="auto" className="truncate text-sm text-muted-foreground">
                  {replyTo.snippet}
                </p>
              </div>
              <button type="button" onClick={() => onCancelReply?.()} aria-label="إلغاء الرد" className={cn(ICON_BUTTON, "text-muted-foreground hover:bg-muted")}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
          {holding ? (
            <div className="flex min-h-11 flex-1 items-center gap-2 overflow-hidden px-3">
              <span className="h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" aria-hidden />
              {clock}
              <span
                className="ms-auto flex items-center gap-0.5 whitespace-nowrap text-sm text-muted-foreground transition-transform motion-reduce:transition-none"
                style={{ transform: `translateX(${slide}px)` }}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
                اسحب للإلغاء
              </span>
            </div>
          ) : recordingView || stoppedView ? (
            // Locked (or stopped and waiting): delete, the clock and the live level, and the round button sends
            <div className="flex min-h-11 flex-1 items-center gap-1.5 pe-3">
              <button type="button" onClick={rec.cancelRecording} aria-label="إلغاء التسجيل" className={cn(ICON_BUTTON, "text-destructive hover:bg-destructive/10")}>
                <Trash2 className="h-5 w-5" aria-hidden />
              </button>
              {recordingView ? (
                <>
                  <span className="h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" aria-hidden />
                  {clock}
                  <LiveLevel stream={voice.stream} className="mx-1 min-w-0 flex-1" />
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {stopReason === "limit" ? "بلغ التسجيل الحد الأقصى" : "توقف التسجيل · جاهز للإرسال"}
                  </span>
                  {clock}
                </>
              )}
            </div>
          ) : (
            <div className="flex items-end">
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={toggleEmoji}
                aria-label="الرموز التعبيرية"
                aria-expanded={emojiOpen}
                className={cn(ICON_BUTTON, "text-muted-foreground hover:bg-muted")}
              >
                {emojiOpen && coarse ? <Keyboard className="h-5 w-5" aria-hidden /> : <Smile className="h-5 w-5" aria-hidden />}
              </button>
              <textarea
                id="chat-composer"
                ref={area}
                value={text}
                rows={1}
                dir="auto"
                maxLength={MAX + 50}
                enterKeyHint={coarse ? "enter" : "send"}
                aria-label={female ? "اكتبي رسالتكِ" : "اكتب رسالتك"}
                placeholder={female ? "اكتبي رسالتكِ…" : "اكتب رسالتك…"}
                onFocus={() => {
                  insertAt.current = null;
                  if (coarse) setEmojiOpen(false);
                }}
                onChange={(e) => {
                  setText(e.target.value);
                  onTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (!enterSends({ coarsePointer: isCoarse(), shiftKey: e.shiftKey, composing: !!e.nativeEvent.isComposing })) return;
                  e.preventDefault();
                  void submit();
                }}
                className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-base leading-relaxed outline-none"
              />
              {media &&
                (locked ? (
                  <button type="button" onClick={media.onLocked} aria-label="إرفاق · متاح لأعضاء Pro" className={cn(ICON_BUTTON, "text-muted-foreground/60 hover:bg-muted/60")}>
                    <Paperclip className="h-5 w-5" aria-hidden />
                    {/* One Pro tag: on the mic while it shows, else here (QA DS-14) */}
                    {!showMic && <ProLock />}
                  </button>
                ) : (
                  <DropdownMenu dir="rtl">
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label="إرفاق" className={cn(ICON_BUTTON, "text-muted-foreground hover:bg-muted")}>
                        <Paperclip className="h-5 w-5" aria-hidden />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="end">
                      <DropdownMenuItem className="min-h-11" onSelect={() => gallery.current?.click()}>
                        <ImageIcon className="h-4 w-4" aria-hidden />
                        المعرض
                      </DropdownMenuItem>
                      {/* A desktop has no camera to pick from */}
                      {coarse && (
                        <DropdownMenuItem className="min-h-11" onSelect={() => camera.current?.click()}>
                          <Camera className="h-4 w-4" aria-hidden />
                          الكاميرا
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ))}
              {/* No separate camera button (owner, 2026-11-13): «الكاميرا» is in the attach menu on phones */}
            </div>
          )}
          {media && !locked && (
            <>
              <input ref={gallery} type="file" accept="image/*" className="hidden" tabIndex={-1} onChange={pickFile} />
              <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} onChange={pickFile} />
            </>
          )}
        </div>

        {/* One round button: mic (hold to record) while the box is empty, send once there is text or a note */}
        <div className="relative flex-shrink-0">
          {holding && (
            // Slide up to lock
            <div aria-hidden className="pointer-events-none absolute bottom-full start-1/2 mb-3 flex -translate-x-1/2 flex-col items-center gap-0.5 rounded-full bg-card px-2 py-2 text-muted-foreground shadow-md ring-1 ring-border/60 rtl:translate-x-1/2">
              <Lock className="h-4 w-4" />
              <ChevronUp className="h-4 w-4 animate-bounce motion-reduce:animate-none" />
            </div>
          )}
          <button
            ref={roundButton}
            type="button"
            onClick={(e) => {
              if (!rec.roundClick(e, showMic)) void submit();
            }}
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
                  ? locked
                    ? "تسجيل رسالة صوتية · متاح لأعضاء Pro"
                    : "تسجيل رسالة صوتية"
                  : "إرسال"
            }
            aria-describedby={showMic && media?.mode === "enabled" ? micHintId : undefined}
            className={cn(
              "relative flex size-12 touch-none select-none items-center justify-center rounded-full transition-all [-webkit-touch-callout:none] disabled:opacity-40 motion-reduce:transition-none",
              showMic && locked ? "bg-muted text-muted-foreground/60 hover:bg-muted/80" : "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90",
              holding ? "scale-125" : "active:scale-95"
            )}
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : showMic || holding ? (
              <Mic className="h-5 w-5" aria-hidden />
            ) : (
              <SendHorizontal className="h-5 w-5 -scale-x-100" aria-hidden />
            )}
            {showMic && locked && <ProLock />}
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
      {panel && coarse && (
        <div className="-mx-2 mt-1.5 h-[280px]">
          <EmojiPanel onPick={insertEmoji} className="h-full" />
        </div>
      )}
    </div>
  );
});
