/**
 * Voice notes that play everywhere: iPhone (AVFoundation, behind the app's players and older Safari) can't play
 * WebM or Ogg, and Chrome may record Opus inside MP4, so every voice note is transcoded to AAC in an .m4a and stored
 * as `audio/mp4` (an MP4 is never trusted to hold AAC).
 *
 * ffmpeg runs as a child process (the `ffmpeg-static` binary, nothing installed on the server), off the event loop,
 * one at a time (at most VOICE_QUEUE_MAX waiting), killed after 30 s, with no shell. The input never touches the disk and never picks its own parser:
 * - the demuxer is pinned from the validated MIME (`-f webm|ogg|mp4|aac|mp3`), so content can't switch ffmpeg to a
 *   playlist (HLS) or any other demuxer that opens further URLs;
 * - the bytes go in on stdin (`pipe:0`) with `-protocol_whitelist pipe` (MP4: `cache,pipe`, because a file with
 *   `moov` after `mdat` needs to seek back; `cache:` only buffers that same pipe in a temp file), so no `file:`,
 *   network or other protocol can be opened.
 * The output goes to a private temp file, because the MP4 muxer needs a seekable file to put `moov` first
 * (`+faststart`: playback starts before the download ends).
 * Server only. `FFMPEG_PATH` overrides the binary (tests, or a server without the downloaded one).
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { IntroError } from "@/lib/intro/errors";
import { VOICE_MAX_SEC, baseMime } from "@/lib/chat/media";

export const VOICE_TRANSCODE_TIMEOUT_MS = 30_000;
/** Transcodes waiting or running at once: more are refused at once («حاول مرة أخرى»), so a burst can't queue past the proxy timeout */
export const VOICE_QUEUE_MAX = 4;
export const VOICE_PROCESS_FAILED_MESSAGE = "تعذّر تجهيز الرسالة الصوتية، حاول مرة أخرى";

/** The ffmpeg demuxer for each accepted voice MIME (lib/chat/media VOICE_TYPES). Anything else is refused */
const INPUT_FORMAT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "mp4",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
};

/** The pinned input: demuxer, allowed protocols and URL, from the declared (validated) type; null when not a voice type */
export function voiceInput(type: string): { format: string; protocols: string; url: string } | null {
  const format = INPUT_FORMAT[baseMime(type)];
  if (!format) return null;
  return format === "mp4"
    ? { format, protocols: "cache,pipe", url: "cache:pipe:0" }
    : { format, protocols: "pipe", url: "pipe:0" };
}

async function ffmpegBinary(): Promise<string> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  // Loaded at run time from node_modules (serverExternalPackages): the path is next to the package
  const mod = (await import("ffmpeg-static")) as unknown as { default?: string | null };
  const bin = mod.default ?? (mod as unknown as string | null);
  if (typeof bin !== "string" || !bin) throw new Error("ffmpeg binary not available");
  return bin;
}

function runFfmpeg(bin: string, args: string[], input: Buffer, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["pipe", "ignore", "pipe"], shell: false });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < 2000) stderr += d.toString();
    });
    let timedOut = false;
    // Killed on time out; the promise settles only once the process has exited, so the temp dir is removed after it
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("exit", () => {
      if (timedOut) reject(new Error("voice transcode timed out"));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error("voice transcode timed out"));
      else if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code ?? signal}: ${stderr.split("\n")[0]}`));
    });
    // ffmpeg may stop reading early (bad input, timeout): its exit code decides, never a broken pipe
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

let queue: Promise<unknown> = Promise.resolve();
let pending = 0;

/**
 * A voice note of the given (validated) type → AAC 64 kb/s in an MP4 (.m4a), `moov` first, no metadata, at most
 * VOICE_MAX_SEC + 1 s. Queued: one ffmpeg at a time. Throws the Arabic MEDIA_INVALID error on any failure or timeout.
 */
export function transcodeVoiceToM4a(buf: Buffer, type: string, opts: { timeoutMs?: number } = {}): Promise<Buffer> {
  const timeoutMs = opts.timeoutMs ?? VOICE_TRANSCODE_TIMEOUT_MS;
  const input = voiceInput(type);
  if (pending >= VOICE_QUEUE_MAX) {
    console.warn("[chat-media] voice transcode queue full, refused");
    return Promise.reject(new IntroError("MEDIA_INVALID", VOICE_PROCESS_FAILED_MESSAGE));
  }
  pending += 1;
  const job = queue.then(async () => {
    if (!input) throw new Error(`not a voice type: ${baseMime(type).slice(0, 40)}`);
    const dir = await mkdtemp(path.join(tmpdir(), "naseebak-voice-"));
    try {
      const output = path.join(dir, "out.m4a");
      const args = [
        "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
        "-protocol_whitelist", input.protocols, "-f", input.format, "-i", input.url,
        "-vn", "-map_metadata", "-1", "-t", String(VOICE_MAX_SEC + 1),
        "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", "-f", "mp4",
        output,
      ];
      await runFfmpeg(await ffmpegBinary(), args, buf, timeoutMs);
      const out = await readFile(output);
      if (out.length === 0) throw new Error("ffmpeg wrote nothing");
      return out;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
  const settled = job.finally(() => {
    pending -= 1;
  });
  queue = settled.catch(() => undefined);
  return settled.catch((e) => {
    // Never the file's content or a storage path: only what ffmpeg said
    console.error("[chat-media] voice transcode failed:", String((e as Error)?.message ?? e).slice(0, 300));
    throw new IntroError("MEDIA_INVALID", VOICE_PROCESS_FAILED_MESSAGE);
  });
}

/** The file to store for a voice note: always transcoded to AAC in an .m4a (`audio/mp4`), whatever was sent */
export async function prepareVoice(buf: Buffer, type: string): Promise<{ buffer: Buffer; type: string; ext: string }> {
  return { buffer: await transcodeVoiceToM4a(buf, type), type: "audio/mp4", ext: "m4a" };
}
