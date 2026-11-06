// «سؤال نصيبك»: types and pure helpers shared by the server, the public page, the dashboard card and the admin.
// No database import here: client components import from this file.
import { localizedPath } from "@/lib/site-paths";
import type { CountryCode } from "@/lib/countries";

/** Results stay hidden until this many votes (a tiny count reads as an empty site) */
export const MIN_POLL_RESULTS = 10;
/** The women/men split shows only when both groups reach this many member votes */
export const MIN_GENDER_RESULTS = 10;
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 4;
export const POLL_QUESTION_MAX = 120;
export const POLL_OPTION_MAX = 40;
export const POLL_NOTE_MAX = 200;

export type PollSource = "dashboard" | "page" | "instagram";
export type PollStatusValue = "DRAFT" | "ACTIVE" | "CLOSED";

export interface PollOption {
  id: string;
  label: string;
}

export interface PollResults {
  total: number;
  /** Whole percentages per option id, summing to 100 */
  percents: Record<string, number>;
  /** Members only, when both groups are big enough */
  split: { women: Record<string, number>; men: Record<string, number> } | null;
}

/** What a voter (member or visitor) sees */
export interface PublicPoll {
  id: string;
  slug: string;
  country: string;
  question: string;
  options: PollOption[];
  note: string | null;
  status: PollStatusValue;
  /** When the next question replaces this one (ISO), while it runs */
  endsAt: string | null;
  myVote: string | null;
  /** Credits this member got for answering (0 for visitors) */
  rewardCredits: number;
  /** Credits a member would get for answering now (members only; never shown on public pages) */
  offerCredits: number;
  /** Shown after voting (or once closed), from MIN_POLL_RESULTS votes */
  results: PollResults | null;
  /** Votes still needed before results show (0 when shown) */
  votesNeeded: number;
}

/** Whole percentages that add up to 100 (largest remainder); all zero when there are no votes */
export function percentsOf(counts: Record<string, number>, optionIds: string[]): Record<string, number> {
  const total = optionIds.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
  const out: Record<string, number> = {};
  if (total === 0) {
    for (const id of optionIds) out[id] = 0;
    return out;
  }
  const raw = optionIds.map((id) => ({ id, exact: ((counts[id] ?? 0) * 100) / total }));
  for (const r of raw) out[r.id] = Math.floor(r.exact);
  let left = 100 - raw.reduce((sum, r) => sum + out[r.id], 0);
  for (const r of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left <= 0) break;
    out[r.id] += 1;
    left -= 1;
  }
  return out;
}

/** Link for an Instagram story sticker or bio, tagged for analytics */
export function pollShareUrl(base: string, slug?: string, medium: "story" | "bio" | "post" = "story", country: CountryCode = "JO"): string {
  const path = localizedPath(slug ? `/poll/${slug}` : "/poll", country);
  return `${base.replace(/\/$/, "")}${path}?utm_source=instagram&utm_medium=${medium}&utm_campaign=naseebak_question`;
}
