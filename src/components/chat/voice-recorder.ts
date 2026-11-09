/**
 * Voice notes in the website chat: a thin MediaRecorder wrapper (browser only, no db imports).
 * The microphone is asked for only when recording starts; the tracks stop as soon as it ends.
 */

/** Recording stops by itself here (the server allows up to 185 s) */
export const MAX_RECORD_SEC = 180;

/** Shorter than this counts as a slip of the finger: nothing is sent */
const MIN_RECORD_MS = 700;

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
      return "المتصفح لا يدعم تسجيل الصوت. جرّب متصفحاً آخر.";
    case "denied":
      return "لم يُسمح باستخدام الميكروفون. يمكنك السماح به من إعدادات المتصفح ثم المحاولة مرة أخرى.";
    case "too_short":
      return "الرسالة الصوتية قصيرة جداً";
    default:
      return "تعذّر تسجيل الصوت. حاول مرة أخرى.";
  }
}

/** Opus in WebM where the browser can record it (Chrome, Firefox, Android), else MP4/AAC (Safari) */
export function pickVoiceType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  const supported = (t: string) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  };
  if (supported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (supported("audio/mp4")) return "audio/mp4";
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

/** Photos: the long side sent at most (the server stores 1600 px WebP anyway) */
const PHOTO_MAX_SIDE = 2048;
/** Already small enough to send untouched (when the format is one the server reads) */
const PHOTO_PASS_BYTES = 1.5 * 1024 * 1024;
const PASS_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface PreparedPhoto {
  blob: Blob;
  width: number | null;
  height: number | null;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

/**
 * Before upload: HEIC/HEIF (which the server can't read) and large photos become a JPEG of at most
 * 2048 px on the long side, when the browser can decode them (iPhone Safari decodes HEIC). A small
 * JPEG/PNG/WebP goes as it is. Returns null when the photo can't be used at all.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto | null> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    // Not decodable here: let the server judge a type it reads, refuse the rest now
    return PASS_TYPES.includes(file.type) ? { blob: file, width: null, height: null } : null;
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  if (PASS_TYPES.includes(file.type) && file.size <= PHOTO_PASS_BYTES && Math.max(w, h) <= PHOTO_MAX_SIDE) {
    return { blob: file, width: w, height: h };
  }
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return PASS_TYPES.includes(file.type) ? { blob: file, width: w, height: h } : null;
  // JPEG has no transparency: a white page under a PNG's clear parts
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) return PASS_TYPES.includes(file.type) ? { blob: file, width: w, height: h } : null;
  return { blob, width: cw, height: ch };
}
