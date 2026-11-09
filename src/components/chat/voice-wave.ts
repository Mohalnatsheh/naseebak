/**
 * Voice notes (db-free): a waveform drawn from the note's length (no audio analysis), seeking, the speed and the
 * unplayed dot (this browser only). Same rules as the app's voice_playback.dart.
 */

const MIN_BARS = 20;
const MAX_BARS = 40;

/** A small seeded generator: the same note always draws the same waveform */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Bar heights (0, 1] for a note: 20 bars for a short note up to 40 for a long one, smoothed to look like speech */
export function voiceBars(id: string, durationSec: number | null | undefined): number[] {
  const count = Math.round(Math.min(MAX_BARS, Math.max(MIN_BARS, MIN_BARS + (durationSec ?? 0) / 3)));
  const rand = seeded(id);
  const raw = Array.from({ length: count }, () => rand());
  return raw.map((v, i) => {
    const near = ((raw[i - 1] ?? v) + v * 2 + (raw[i + 1] ?? v)) / 4;
    return Math.round(Math.min(1, 0.22 + near * 0.78) * 100) / 100;
  });
}

/** Where a tap / drag at `clientX` falls on the waveform, from its start edge (the right in RTL), 0..1 */
export function seekFraction(clientX: number, rect: { left: number; width: number }, rtl: boolean): number {
  if (!rect.width) return 0;
  const f = (clientX - rect.left) / rect.width;
  return Math.min(1, Math.max(0, rtl ? 1 - f : f));
}

export const VOICE_SPEEDS = [1, 1.5, 2] as const;
export type VoiceSpeed = (typeof VOICE_SPEEDS)[number];

export function nextVoiceSpeed(speed: number): VoiceSpeed {
  const i = VOICE_SPEEDS.indexOf(speed as VoiceSpeed);
  return VOICE_SPEEDS[(i + 1) % VOICE_SPEEDS.length];
}

const PLAYED_KEY = "naseeb:voice-played";
/** The newest this many played notes are remembered */
const PLAYED_MAX = 400;

function readPlayed(): string[] | null {
  try {
    const raw = localStorage.getItem(PLAYED_KEY);
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch (error) {
    // Storage blocked: null (no dot at all); a broken value: start again
    return error instanceof SyntaxError ? [] : null;
  }
}

/** The other person's note was played in this browser. Storage that can't be read counts as played (no dot) */
export function hasPlayedVoice(id: string): boolean {
  const list = readPlayed();
  return list === null || list.includes(id);
}

export function markVoicePlayed(id: string): void {
  const list = readPlayed();
  if (list === null || list.includes(id)) return;
  try {
    localStorage.setItem(PLAYED_KEY, JSON.stringify([...list, id].slice(-PLAYED_MAX)));
  } catch {
    // private mode / full: the dot simply comes back next time
  }
}
