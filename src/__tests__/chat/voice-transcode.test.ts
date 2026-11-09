import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { IntroError } from "@/lib/intro/errors";
import {
  VOICE_PROCESS_FAILED_MESSAGE,
  prepareVoice,
  transcodeVoiceToM4a,
  voiceInput,
} from "@/lib/chat/voice-transcode";

// Real ffmpeg (the ffmpeg-static binary): small generated clips of each format a browser may record
const dir = mkdtempSync(join(tmpdir(), "voice-test-"));
const clip: Record<string, Buffer> = {};

function make(name: string, codecArgs: string[]) {
  const out = join(dir, name);
  execFileSync(ffmpegPath as unknown as string, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=d=2", ...codecArgs, out]);
  return readFileSync(out);
}

beforeAll(() => {
  clip.webm = make("in.webm", ["-c:a", "libopus"]);
  clip.ogg = make("in.ogg", ["-c:a", "libopus"]);
  clip.mp3 = make("in.mp3", ["-c:a", "libmp3lame"]);
  clip.m4a = make("in.m4a", ["-c:a", "aac", "-movflags", "+faststart"]);
  // What the app records (AVAudioRecorder / Android MediaRecorder): `moov` after a large `mdat`
  clip.m4aTail = make("tail.m4a", ["-c:a", "aac", "-b:a", "256k", "-t", "60"]);
  // What Chrome may record for `audio/mp4`: Opus inside fragmented MP4
  clip.mp4opus = make("opus.mp4", ["-c:a", "libopus", "-f", "mp4", "-movflags", "frag_keyframe+empty_moov"]);
  clip.adts = make("in.aac", ["-c:a", "aac", "-f", "adts"]);
});

afterEach(() => {
  delete process.env.FFMPEG_PATH;
});

/** An MP4 whose `moov` box comes before `mdat` (faststart: plays while it downloads) with an AAC track */
function expectFaststartAacMp4(buf: Buffer) {
  expect(buf.toString("latin1", 4, 8)).toBe("ftyp");
  const moov = buf.indexOf("moov");
  const mdat = buf.indexOf("mdat");
  expect(moov).toBeGreaterThan(0);
  expect(moov).toBeLessThan(mdat);
  expect(buf.indexOf("mp4a")).toBeGreaterThan(0);
}

async function expectMediaInvalid(p: Promise<unknown>) {
  const e = await p.then(() => null, (err) => err);
  expect(e).toBeInstanceOf(IntroError);
  expect((e as IntroError).code).toBe("MEDIA_INVALID");
  expect((e as IntroError).message).toBe(VOICE_PROCESS_FAILED_MESSAGE);
}

describe("voiceInput: the demuxer and protocols are pinned from the validated type", () => {
  it("maps every voice type to its own demuxer; MP4 alone may seek back through the cache of the same pipe", () => {
    expect(voiceInput("audio/webm;codecs=opus")).toEqual({ format: "webm", protocols: "pipe", url: "pipe:0" });
    expect(voiceInput("audio/ogg")).toEqual({ format: "ogg", protocols: "pipe", url: "pipe:0" });
    expect(voiceInput("audio/mpeg")).toEqual({ format: "mp3", protocols: "pipe", url: "pipe:0" });
    expect(voiceInput("audio/aac")).toEqual({ format: "aac", protocols: "pipe", url: "pipe:0" });
    expect(voiceInput("Audio/MP4; codecs=mp4a.40.2")).toEqual({ format: "mp4", protocols: "cache,pipe", url: "cache:pipe:0" });
    expect(voiceInput("audio/x-m4a")?.format).toBe("mp4");
  });

  it("anything else has no input at all", () => {
    expect(voiceInput("application/vnd.apple.mpegurl")).toBeNull();
    expect(voiceInput("video/mp4")).toBeNull();
    expect(voiceInput("")).toBeNull();
  });
});

describe("prepareVoice: every voice note becomes AAC in an .m4a", () => {
  it.each([
    ["webm", "audio/webm;codecs=opus"],
    ["ogg", "audio/ogg"],
    ["mp3", "audio/mpeg"],
    ["m4a", "audio/mp4"],
    ["m4aTail", "audio/x-m4a"],
    ["mp4opus", "audio/mp4"],
    ["adts", "audio/aac"],
  ])("%s (%s) → AAC in an .m4a, stored as audio/mp4", async (name, type) => {
    const out = await prepareVoice(clip[name], type);
    expect(out.type).toBe("audio/mp4");
    expect(out.ext).toBe("m4a");
    expectFaststartAacMp4(out.buffer);
  });

  it("an MP4 holding Opus comes out with no Opus left", async () => {
    expect(clip.mp4opus.includes("Opus")).toBe(true);
    const out = await prepareVoice(clip.mp4opus, "audio/mp4");
    expect(out.buffer.includes("Opus")).toBe(false);
    expect(out.buffer).not.toEqual(clip.mp4opus);
  });

  it("drops the source's metadata", async () => {
    const tagged = make("tagged.webm", ["-c:a", "libopus", "-metadata", "title=SECRET-TITLE-123"]);
    expect(tagged.includes("SECRET-TITLE-123")).toBe(true);
    const out = await prepareVoice(tagged, "audio/webm");
    expect(out.buffer.includes("SECRET-TITLE-123")).toBe(false);
  });

  it("a file that isn't audio: the Arabic error (422), never a crash", async () => {
    await expectMediaInvalid(prepareVoice(Buffer.from("not audio at all, just text"), "audio/webm"));
    await expectMediaInvalid(prepareVoice(Buffer.from("not audio at all, just text"), "audio/mp4"));
  });

  it("a declared type that isn't a voice type never reaches ffmpeg", async () => {
    await expectMediaInvalid(prepareVoice(clip.webm, "application/vnd.apple.mpegurl"));
  });

  it("a playlist declared as audio is refused, and the file it names is never read", async () => {
    // The HLS demuxer, if content could pick it, would open this local file (ffmpeg's `file` protocol)
    const secret = join(dir, "secret.mp3");
    writeFileSync(secret, clip.mp3);
    const playlist = Buffer.from(`#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\n${secret}\n#EXT-X-ENDLIST\n`);
    for (const type of ["audio/webm", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/aac"]) {
      await expectMediaInvalid(prepareVoice(playlist, type));
    }
  });
});

describe("transcodeVoiceToM4a: the child process", () => {
  it("is killed after the time limit, with the Arabic error", async () => {
    const slow = join(dir, "slow-ffmpeg.sh");
    writeFileSync(slow, "#!/bin/sh\nsleep 5\n");
    chmodSync(slow, 0o755);
    process.env.FFMPEG_PATH = slow;
    const started = Date.now();
    await expectMediaInvalid(transcodeVoiceToM4a(clip.webm, "audio/webm", { timeoutMs: 300 }));
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("runs one at a time (queued)", async () => {
    const log = join(dir, "order.log");
    writeFileSync(log, "");
    const fake = join(dir, "fake-ffmpeg.sh");
    // Logs start/end, then writes the output (its last argument)
    writeFileSync(fake, `#!/bin/sh\necho start >> "${log}"\nsleep 0.2\necho end >> "${log}"\nfor a; do last="$a"; done\nprintf fake > "$last"\n`);
    chmodSync(fake, 0o755);
    process.env.FFMPEG_PATH = fake;
    const outs = await Promise.all([transcodeVoiceToM4a(clip.webm, "audio/webm"), transcodeVoiceToM4a(clip.webm, "audio/webm"), transcodeVoiceToM4a(clip.webm, "audio/webm")]);
    expect(outs.map((b) => b.toString())).toEqual(["fake", "fake", "fake"]);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["start", "end", "start", "end", "start", "end"]);
  });

  it("a failed job doesn't stop the queue", async () => {
    process.env.FFMPEG_PATH = join(dir, "missing-binary");
    await expectMediaInvalid(transcodeVoiceToM4a(clip.webm, "audio/webm"));
    delete process.env.FFMPEG_PATH;
    expectFaststartAacMp4(await transcodeVoiceToM4a(clip.webm, "audio/webm"));
  });

  it("spawns with the pinned demuxer, the protocol whitelist and stdin as the only input", async () => {
    const argsLog = join(dir, "args.log");
    const stdinLog = join(dir, "stdin.bin");
    const fake = join(dir, "args-ffmpeg.sh");
    // Logs one argument per line, saves stdin, then writes the output (its last argument)
    writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' "$@" > "${argsLog}"\ncat > "${stdinLog}"\nfor a; do last="$a"; done\nprintf fake > "$last"\n`);
    chmodSync(fake, 0o755);
    process.env.FFMPEG_PATH = fake;

    await transcodeVoiceToM4a(clip.webm, "audio/webm;codecs=opus");
    let args = readFileSync(argsLog, "utf8").trim().split("\n");
    const before = (flag: string) => args[args.indexOf(flag) + 1];
    expect(before("-protocol_whitelist")).toBe("pipe");
    expect(before("-f")).toBe("webm");
    expect(before("-i")).toBe("pipe:0");
    expect(args.indexOf("-protocol_whitelist")).toBeLessThan(args.indexOf("-i"));
    expect(args.indexOf("-f")).toBeLessThan(args.indexOf("-i"));
    // The input is never a path on disk: the bytes came in on stdin
    expect(args.filter((a) => a.startsWith("/") || a.startsWith("file:"))).toEqual([args[args.length - 1]]);
    expect(readFileSync(stdinLog)).toEqual(clip.webm);

    await transcodeVoiceToM4a(clip.m4a, "audio/x-m4a");
    args = readFileSync(argsLog, "utf8").trim().split("\n");
    expect(before("-protocol_whitelist")).toBe("cache,pipe");
    expect(before("-f")).toBe("mp4");
    expect(before("-i")).toBe("cache:pipe:0");
  });
});
