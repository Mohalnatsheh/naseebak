"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useVoiceRecording, type ComposerMedia } from "./media-buttons";
import { holdGesture, holdReleaseSends } from "./chat-interactions";

/** A press on the mic: where it went down, and in which direction the page reads */
type Hold = { id: number; x: number; y: number; rtl: boolean };

/** Starting the recorder took this long: the microphone prompt was open (audit U3) */
const SLOW_START_MS = 600;

/**
 * Hold to record, shared by both composers (classic and WhatsApp-style).
 *
 * Pointer events, the same on touch and mouse: press and hold the mic; release sends; slide towards the start edge to
 * cancel; slide up to lock. A lost press (pointercancel, the pointer leaving, a second finger) or a hidden tab stops the
 * recording and waits — never a silent send. A keyboard press (a click with no pointer press) records hands-free.
 * Esc cancels a recording.
 *
 * `onError` gets the short hint after a tap on the mic (null clears it at the next press). With `permissionHint`
 * (WhatsApp layout only), a tap that came while the microphone prompt was open says the microphone is now allowed.
 */
export function useHoldToRecord(
  media: ComposerMedia | undefined,
  {
    female,
    onError,
    textRef,
    permissionHint = false,
  }: {
    female?: boolean;
    onError: (message: string | null) => void;
    /** The text box: the focus goes back there after a cancel */
    textRef: RefObject<HTMLTextAreaElement | null>;
    permissionHint?: boolean;
  }
) {
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

  // A second finger (or another pointer) anywhere while holding: the press is no longer clear. Subscribed once per
  // press (not on every move); the latest loseHold is read through a ref
  const loseHoldRef = useRef(loseHold);
  useEffect(() => {
    loseHoldRef.current = loseHold;
  });
  const pressing = holdDx !== null;
  useEffect(() => {
    if (!pressing) return;
    const onDown = (e: PointerEvent) => {
      if (hold.current && e.pointerId !== hold.current.id) loseHoldRef.current();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [pressing]);

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
    onError(null);
    const began = Date.now();
    void voice.start({ keep: () => hold.current !== null || lockedDuringStart.current }).then((ok) => {
      if (!ok && releasedEarly.current) {
        const slow = permissionHint && Date.now() - began > SLOW_START_MS;
        onError(
          slow
            ? female
              ? "تم السماح بالميكروفون، اضغطي مطولاً للتسجيل"
              : "تم السماح بالميكروفون، اضغط مطولاً للتسجيل"
            : female
              ? "اضغطي مطولاً للتسجيل، وارفعي إصبعكِ للإرسال"
              : "اضغط مطولاً للتسجيل، وارفع إصبعك للإرسال"
        );
      }
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
    // Released far from the mic (the finger wandered off): stop and wait, like the app — never a silent send
    const near = holdReleaseSends({ dx: e.clientX - h.x, dy: e.clientY - h.y });
    if (phase === "recording") void (near ? voice.send() : voice.pause("interrupted"));
    else if (phase === "starting") releasedEarly.current = true;
  }

  // One announcement per change (QA PA-L3 / WC2-11): the ticking clock is never read out
  // (state adjusted while rendering, not in an effect)
  const [said, setSaid] = useState("");
  const [lastPhase, setLastPhase] = useState(phase);
  if (phase !== lastPhase) {
    setLastPhase(phase);
    if (phase === "recording") setSaid("بدأ التسجيل");
    else if (phase === "stopped") setSaid("توقف التسجيل · جاهز للإرسال");
  }

  const roundButton = useRef<HTMLButtonElement>(null);
  /** «إيقاف التسجيل»: its button goes away, so the focus moves to «إرسال الرسالة الصوتية» (QA PA-M9) */
  function stopByHand() {
    void voice.pause("manual");
    requestAnimationFrame(() => roundButton.current?.focus());
  }
  function cancelRecording() {
    voice.cancel();
    setSaid("أُلغي التسجيل");
    requestAnimationFrame(() => textRef.current?.focus());
  }

  /** Esc while recording (or while the microphone prompt is open): cancel. True when handled */
  function escape(): boolean {
    if (!(busyVoice || phase === "starting")) return false;
    endHold();
    cancelRecording();
    return true;
  }

  /** A press on the round button: the mic starts a hold; send keeps the focus in the box (the phone keyboard stays) */
  function roundPointerDown(e: React.PointerEvent<HTMLButtonElement>, showMic: boolean) {
    if (showMic) return startHold(e);
    swallowClick.current = false;
    // Keep the focus in the box so the phone keyboard stays open between messages
    e.preventDefault();
  }

  /** A click on the round button. True when it was the voice part's (else the composer sends its text) */
  function roundClick(e: React.MouseEvent, showMic: boolean): boolean {
    if (swallowClick.current && e.detail > 0) {
      swallowClick.current = false;
      return true;
    }
    if (busyVoice) {
      void voice.send();
      return true;
    }
    if (showMic && media) {
      if (media.mode === "locked") media.onLocked();
      // Keyboard / assistive tech (a click with no press): record hands-free, then stop / cancel / send
      else void voice.start();
      return true;
    }
    return false;
  }

  const elapsed = "elapsed" in voice.state ? voice.state.elapsed : 0;
  const stopReason = voice.state.phase === "stopping" || voice.state.phase === "stopped" ? voice.state.reason : null;
  // Slide-to-cancel follows the finger a little (towards the start edge only)
  const slide = holdDx === null ? 0 : Math.max(-120, Math.min(120, holdDx));

  return {
    voice,
    phase,
    holding,
    recordingView,
    stoppedView,
    busyVoice,
    elapsed,
    stopReason,
    slide,
    said,
    roundButton,
    moveHold,
    releaseHold,
    loseHold,
    stopByHand,
    cancelRecording,
    escape,
    roundPointerDown,
    roundClick,
  };
}
