import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { IntroError } from "@/lib/intro/errors";
import {
  VOICE_PROCESS_FAILED_MESSAGE,
  needsVoiceTranscode,
  prepareVoice,
  transcodeVoiceToM4a,
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

describe("needsVoiceTranscode: only MP4/AAC plays on every iPhone", () => {
  it("webm, ogg and mp3 are transcoded; mp4, m4a and aac are kept", () => {
    expect(needsVoiceTranscode("audio/webm;codecs=opus")).toBe(true);
    expect(needsVoiceTranscode("audio/ogg")).toBe(true);
    expect(needsVoiceTranscode("audio/mpeg")).toBe(true);
    expect(needsVoiceTranscode("audio/mp4")).toBe(false);
    expect(needsVoiceTranscode("Audio/MP4; codecs=mp4a.40.2")).toBe(false);
    expect(needsVoiceTranscode("audio/x-m4a")).toBe(false);
    expect(needsVoiceTranscode("audio/aac")).toBe(false);
  });
});

describe("prepareVoice", () => {
  it.each(["webm", "ogg", "mp3"])("%s → AAC in an .m4a, stored as audio/mp4", async (fmt) => {
    const type = { webm: "audio/webm;codecs=opus", ogg: "audio/ogg", mp3: "audio/mpeg" }[fmt]!;
    const out = await prepareVoice(clip[fmt], type);
    expect(out.type).toBe("audio/mp4");
    expect(out.ext).toBe("m4a");
    expectFaststartAacMp4(out.buffer);
  });

  it("an MP4 voice note is stored as sent, untouched", async () => {
    const out = await prepareVoice(clip.m4a, "audio/mp4");
    expect(out).toEqual({ buffer: clip.m4a, type: "audio/mp4", ext: "m4a" });
    const aac = await prepareVoice(Buffer.from("adts"), "audio/aac");
    expect(aac.type).toBe("audio/aac");
    expect(aac.ext).toBe("aac");
  });

  it("drops the source's metadata", async () => {
    const tagged = make("tagged.webm", ["-c:a", "libopus", "-metadata", "title=SECRET-TITLE-123"]);
    expect(tagged.includes("SECRET-TITLE-123")).toBe(true);
    const out = await prepareVoice(tagged, "audio/webm");
    expect(out.buffer.includes("SECRET-TITLE-123")).toBe(false);
  });

  it("a file that isn't audio: the Arabic error (422), never a crash", async () => {
    await expectMediaInvalid(prepareVoice(Buffer.from("not audio at all, just text"), "audio/webm"));
  });
});

describe("transcodeVoiceToM4a: the child process", () => {
  it("is killed after the time limit, with the Arabic error", async () => {
    const slow = join(dir, "slow-ffmpeg.sh");
    writeFileSync(slow, "#!/bin/sh\nsleep 5\n");
    chmodSync(slow, 0o755);
    process.env.FFMPEG_PATH = slow;
    const started = Date.now();
    await expectMediaInvalid(transcodeVoiceToM4a(clip.webm, { timeoutMs: 300 }));
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
    const outs = await Promise.all([transcodeVoiceToM4a(clip.webm), transcodeVoiceToM4a(clip.webm), transcodeVoiceToM4a(clip.webm)]);
    expect(outs.map((b) => b.toString())).toEqual(["fake", "fake", "fake"]);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["start", "end", "start", "end", "start", "end"]);
  });

  it("a failed job doesn't stop the queue", async () => {
    process.env.FFMPEG_PATH = join(dir, "missing-binary");
    await expectMediaInvalid(transcodeVoiceToM4a(clip.webm));
    delete process.env.FFMPEG_PATH;
    expectFaststartAacMp4(await transcodeVoiceToM4a(clip.webm));
  });
});
