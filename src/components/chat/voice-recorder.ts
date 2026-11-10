/**
 * Voice notes in the website chat: a thin MediaRecorder wrapper (browser only, no db imports).
 * The microphone is asked for only when recording starts; the tracks stop as soon as it ends.
 */

/** Recording stops by itself here (the server allows up to 185 s) */
export const MAX_RECORD_SEC = 180;

/** Shorter than this counts as a slip of the finger: nothing is sent («الرسالة قصيرة جداً») */
export const MIN_RECORD_MS = 1000;

export interface VoiceRecording {
  blob: Blob;
  /** The recorder's MIME type, e.g. `audio/webm;codecs=opus` (the server drops the codec part) */
  type: string;
  /** Whole seconds, rounded up, at least 1 */
  durationSec: number;
}

export type RecorderErrorCode = "unsupported" | "denied" | "failed" | "too_short";

export class RecorderError extends Error {
  constructor(public code: RecorderErrorCode) {
    super(code);
  }
}

/** Arabic text for a recorder error (shown under the composer, never a crash) */
export function recorderErrorMessage(code: RecorderErrorCode): string {
  switch (code) {
    case "unsupported":
      return "المتصفح لا يدعم تسجيل الصوت. يمكنك تجربة متصفح آخر.";
    case "denied":
      return "لم يُسمح باستخدام الميكروفون. يمكنك السماح به من إعدادات المتصفح ثم المحاولة مرة أخرى.";
    case "too_short":
      return "الرسالة قصيرة جداً";
    default:
      return "تعذّر تسجيل الصوت. يمكنك المحاولة مرة أخرى.";
  }
}

/**
 * MP4/AAC where the browser can record it (Safari, recent Chrome): it plays everywhere, the iPhone app included.
 * Else Opus in WebM (Firefox, older Chrome); the server turns that into AAC.
 */
export function pickVoiceType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  const supported = (t: string) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  };
  if (supported("audio/mp4")) return "audio/mp4";
  if (supported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  return null;
}

/** Whole seconds for a recording of `ms` milliseconds: rounded up, at least 1, at most the limit */
export function recordedSeconds(ms: number): number {
  return Math.min(MAX_RECORD_SEC, Math.max(1, Math.ceil(ms / 1000)));
}

export interface ActiveRecording {
  /** Stop and hand back the recording */
  stop: () => Promise<VoiceRecording>;
  /** Stop and throw it away */
  cancel: () => void;
  /** The microphone, for the live level while recording (stopped with the recording) */
  stream: MediaStream;
}

/**
 * Asks for the microphone and starts recording. `onLimit` runs once when MAX_RECORD_SEC is reached:
 * the caller then calls stop() (the recording is kept, not lost).
 */
export async function startVoiceRecording({ onLimit }: { onLimit: () => void }): Promise<ActiveRecording> {
  const type = pickVoiceType();
  if (!type || !navigator.mediaDevices?.getUserMedia) throw new RecorderError("unsupported");

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    throw new RecorderError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed");
  }

  const release = () => stream.getTracks().forEach((t) => t.stop());
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: type });
  } catch {
    release();
    throw new RecorderError("unsupported");
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const startedAt = performance.now();
  const limit = setTimeout(onLimit, MAX_RECORD_SEC * 1000);
  try {
    recorder.start(250);
  } catch {
    clearTimeout(limit);
    release();
    throw new RecorderError("failed");
  }

  let done = false;
  const finish = () => {
    done = true;
    clearTimeout(limit);
  };

  return {
    stream,
    stop: () =>
      new Promise<VoiceRecording>((resolve, reject) => {
        if (done) return reject(new RecorderError("failed"));
        finish();
        const elapsed = performance.now() - startedAt;
        recorder.onstop = () => {
          release();
          if (elapsed < MIN_RECORD_MS) return reject(new RecorderError("too_short"));
          const mime = recorder.mimeType || type;
          const blob = new Blob(chunks, { type: mime });
          if (blob.size === 0) return reject(new RecorderError("failed"));
          resolve({ blob, type: mime, durationSec: recordedSeconds(elapsed) });
        };
        recorder.onerror = () => {
          release();
          reject(new RecorderError("failed"));
        };
        try {
          recorder.stop();
        } catch {
          release();
          reject(new RecorderError("failed"));
        }
      }),
    cancel: () => {
      if (done) return;
      finish();
      recorder.onstop = () => release();
      try {
        recorder.stop();
      } catch {
        release();
      }
    },
  };
}
