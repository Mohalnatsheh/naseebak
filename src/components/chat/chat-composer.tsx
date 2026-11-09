"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { SendHorizontal, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MicButton, PhotoButton, RecordingBar, useVoiceRecording, type ComposerMedia } from "./media-buttons";

const MAX = 1000;

export interface ChatComposerHandle {
  /** Put text in the box; `onlyIfEmpty` leaves whatever the member is already typing alone */
  fill: (text: string, opts?: { onlyIfEmpty?: boolean }) => void;
}

/** Auto-growing message box. Enter sends, Shift+Enter adds a line. */
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
}>(function ChatComposer({ onSend, error, onTyping, female, keyboardOpen, media }, ref) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceRecording(media);
  const recording = voice.state.phase === "recording" || voice.state.phase === "stopping" || voice.state.phase === "stopped";
  // The mic takes the send button's place while the box is empty (one round button at the end)
  const showMic = !!media && !text.trim();

  useImperativeHandle(ref, () => ({
    fill: (t: string, opts?: { onlyIfEmpty?: boolean }) => {
      setText((current) => (opts?.onlyIfEmpty && current.trim() ? current : t));
      requestAnimationFrame(() => area.current?.focus());
    },
  }));

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  async function submit() {
    const value = text.trim();
    if (!value || sending || value.length > MAX) return;
    setSending(true);
    const ok = await onSend(value);
    setSending(false);
    if (ok) setText("");
    area.current?.focus();
  }

  return (
    <div
      className={cn(
        "border-t border-border/60 bg-card/95 px-3 pt-2 backdrop-blur supports-[backdrop-filter]:bg-card/80",
        keyboardOpen ? "pb-2" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      )}
    >
      {error && <p className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex items-end gap-2">
        {voice.state.phase === "recording" || voice.state.phase === "stopping" || voice.state.phase === "stopped" ? (
          <RecordingBar
            elapsed={voice.state.elapsed}
            stopped={voice.state.phase !== "recording"}
            sendDisabled={voice.state.phase === "stopping"}
            onSend={() => void voice.send()}
            onCancel={voice.cancel}
          />
        ) : (
          <>
            {media && <PhotoButton media={media} />}
            <textarea
              ref={area}
              value={text}
              rows={1}
              dir="auto"
              maxLength={MAX + 50}
              enterKeyHint="send"
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
              className="max-h-36 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-base leading-relaxed outline-none transition-shadow focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            />
            {showMic && media ? (
              <MicButton media={media} onStart={voice.start} disabled={voice.state.phase === "starting"} />
            ) : (
              <button
                type="button"
                onClick={submit}
                // Keep the focus in the box so the phone keyboard stays open between messages
                onPointerDown={(e) => e.preventDefault()}
                disabled={!text.trim() || sending || text.trim().length > MAX}
                aria-label="إرسال"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5 -scale-x-100" />}
              </button>
            )}
          </>
        )}
      </div>
      {!recording && text.length > 800 && (
        <p className={cn("mt-1 px-2 text-xs", text.length > MAX ? "text-destructive" : "text-muted-foreground")}>
          {text.length} / {MAX}
        </p>
      )}
    </div>
  );
});
