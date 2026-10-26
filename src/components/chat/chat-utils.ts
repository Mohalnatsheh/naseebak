import type { ChatMessage } from "@/lib/chat/service";
import { countryConfig } from "@/lib/countries";

/** A message on screen: saved, or still sending / failed (optimistic). */
export interface UiMessage extends ChatMessage {
  pending?: "sending" | "failed";
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Labels use the member's country locale (Gregorian, Western digits) and the device's clock, like the
// day grouping (`startOfDay`): `country` = the viewer's (JO / SA), Jordan when unknown
export function timeLabel(iso: string, country?: unknown): string {
  return new Date(iso).toLocaleTimeString(countryConfig(country).dateLocale, { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(iso: string, country?: unknown): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "أمس";
  return d.toLocaleDateString(countryConfig(country).dateLocale, { weekday: "long", day: "numeric", month: "long" });
}

/** Chat list: time today, "أمس", else a short date */
export function listTimeLabel(iso: string, country?: unknown): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
  if (diff === 0) return timeLabel(iso, country);
  if (diff === 1) return "أمس";
  return d.toLocaleDateString(countryConfig(country).dateLocale, { day: "numeric", month: "short" });
}

export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** Merge by id, keep chronological order, prefer saved over pending copies */
export function mergeMessages(current: UiMessage[], incoming: UiMessage[]): UiMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m });
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
