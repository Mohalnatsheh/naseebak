/**
 * Voice notes that play everywhere: iPhone (AVFoundation, behind the app's players and older Safari) can't play
 * WebM or Ogg, so anything that isn't already MP4/AAC is transcoded to AAC in an .m4a and stored as `audio/mp4`.
 *
 * ffmpeg runs as a child process (the `ffmpeg-static` binary, nothing installed on the server), off the event loop,
 * one at a time, killed after 30 s. Input and output go through a private temp directory, because the MP4 muxer
 * needs a seekable file to put `moov` first (`+faststart`: playback starts before the download ends).
 * Server only. `FFMPEG_PATH` overrides the binary (tests, or a server without the downloaded one).
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { IntroError } from "@/lib/intro/errors";
import { VOICE_MAX_SEC, baseMime, voiceExtension } from "@/lib/chat/media";

export const VOICE_TRANSCODE_TIMEOUT_MS = 30_000;
export const VOICE_PROCESS_FAILED_MESSAGE = "تعذّر تجهيز الرسالة الصوتية، حاول مرة أخرى";

/** Types every player (iOS, Android, all browsers) plays as they are */
const PLAYABLE_EVERYWHERE = ["audio/mp4", "audio/x-m4a", "audio/aac"];

export function needsVoiceTranscode(type: string): boolean {
  return !PLAYABLE_EVERYWHERE.includes(baseMime(type));
}

async function ffmpegBinary(): Promise<string> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  // Loaded at run time from node_modules (serverExternalPackages): the path is next to the package
  const mod = (await import("ffmpeg-static")) as unknown as { default?: string | null };
  const bin = mod.default ?? (mod as unknown as string | null);
  if (typeof bin !== "string" || !bin) throw new Error("ffmpeg binary not available");
  return bin;
}

function runFfmpeg(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < 2000) stderr += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("voice transcode timed out"));
    }, timeoutMs);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code ?? signal}: ${stderr.split("\n")[0]}`));
    });
  });
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Any audio ffmpeg reads → AAC 64 kb/s in an MP4 (.m4a), `moov` first, no metadata, at most VOICE_MAX_SEC + 1 s.
 * Queued: one ffmpeg at a time. Throws the Arabic MEDIA_INVALID error on any failure or timeout.
 */
export function transcodeVoiceToM4a(buf: Buffer, opts: { timeoutMs?: number } = {}): Promise<Buffer> {
  const timeoutMs = opts.timeoutMs ?? VOICE_TRANSCODE_TIMEOUT_MS;
  const job = queue.then(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "naseebak-voice-"));
    try {
      const input = path.join(dir, "in");
      const output = path.join(dir, "out.m4a");
      await writeFile(input, buf);
      const args = [
        "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
        "-i", input,
        "-vn", "-map_metadata", "-1", "-t", String(VOICE_MAX_SEC + 1),
        "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", "-f", "mp4",
        output,
      ];
      await runFfmpeg(await ffmpegBinary(), args, timeoutMs);
      const out = await readFile(output);
      if (out.length === 0) throw new Error("ffmpeg wrote nothing");
      return out;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
  queue = job.catch(() => undefined);
  return job.catch((e) => {
    // Never the file's content or a storage path: only what ffmpeg said
    console.error("[chat-media] voice transcode failed:", String((e as Error)?.message ?? e).slice(0, 300));
    throw new IntroError("MEDIA_INVALID", VOICE_PROCESS_FAILED_MESSAGE);
  });
}

/** The file to store for a voice note: MP4/AAC as sent, anything else transcoded to `audio/mp4` */
export async function prepareVoice(buf: Buffer, type: string): Promise<{ buffer: Buffer; type: string; ext: string }> {
  const mime = baseMime(type);
  if (!needsVoiceTranscode(mime)) return { buffer: buf, type: mime, ext: voiceExtension(mime) };
  return { buffer: await transcodeVoiceToM4a(buf), type: "audio/mp4", ext: "m4a" };
}
