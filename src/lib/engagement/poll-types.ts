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

/** Public «سؤال نصيبك» wording per country: Levantine for Jordan and Lebanon (the poll's casual voice), standard Arabic for Saudi Arabia */
export interface PollCopy {
  /** Page title of /poll */
  title: string;
  /** Meta description of /poll and /poll/<slug> */
  description: string;
  /** Open Graph description of /poll */
  socialDescription: string;
  /** «لا يوجد سؤال مفتوح الآن» line */
  nextQuestion: string;
  /** Visitor box heading */
  notDating: string;
  /** Under the visitor box's sign-up button */
  answerInAccount: string;
  /** Share sheet line */
  share: string;
}

export const POLL_COPY: Record<CountryCode, PollCopy> = {
  JO: {
    title: "سؤال نصيبك: جاوب وشوف رأي الناس | نصيبك",
    description: "سؤال جديد كل 3 أيام من نصيبك، منصة الزواج الجاد: جاوب بكبسة وشوف رأي الناس.",
    socialDescription: "جاوب بكبسة وشوف رأي الناس.",
    nextQuestion: "ننشر سؤالاً جديداً كل بضعة أيام على انستغرام وهنا. ارجع قريباً.",
    notDating: "نصيبك منصة زواج جاد، مش تطبيق تعارف",
    answerInAccount: "وجاوب على سؤال جديد من داخل حسابك كل 3 أيام.",
    share: "شو رأيك؟ سؤال نصيبك:",
  },
  SA: {
    title: "سؤال نصيبك: أجب واطّلع على رأي الناس | نصيبك",
    description: "سؤال جديد كل 3 أيام من نصيبك، منصة الزواج الجاد: أجب بضغطة واطّلع على رأي الآخرين.",
    socialDescription: "أجب بضغطة واطّلع على رأي الناس.",
    nextQuestion: "ننشر سؤالاً جديداً كل بضعة أيام على إنستقرام وهنا. ارجع قريباً.",
    notDating: "نصيبك منصة زواج جاد، وليست تطبيق تعارف",
    answerInAccount: "وأجب عن سؤال جديد من داخل حسابك كل 3 أيام.",
    share: "ما رأيك؟ سؤال نصيبك:",
  },
  // No Lebanese Instagram account yet: the questions are published here only. Lebanese dialect, no gendered command
  LB: {
    title: "سؤال نصيبك: رأيك ورأي الناس | نصيبك",
    description: "سؤال جديد كل 3 أيام من نصيبك، منصة الزواج الجدّي: الجواب بكبسة، ورأي الناس قدّامك.",
    socialDescription: "الجواب بكبسة، ورأي الناس قدّامك.",
    nextQuestion: "منحطّ سؤال جديد هون كل كم يوم، ومنشوفك قريباً.",
    notDating: "نصيبك منصة زواج جدّي، مش تطبيق تعارف",
    answerInAccount: "وجوّا حسابك في سؤال جديد كل 3 أيام.",
    share: "شو رأيك؟ هيدا سؤال نصيبك:",
  },
};

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
