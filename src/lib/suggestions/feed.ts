/**
 * The three-tab suggestions feed (simultaneous flow), per viewer:
 *   new        — what I still have to decide and nobody answered yet: MUTUAL rows, plus legacy suggestions
 *   interested — what I still have to decide where the other side already said «مهتم» (`likedYou`),
 *                plus legacy interests in flight (owner decision 2026-10-19: interest is shown openly)
 *   waiting    — what I said «مهتم» to and isn't a match (yet): MUTUAL rows until they expire, plus
 *                legacy sent; a row the other side declined carries `declined` (owner decision
 *                2026-10-19: shown as «لم يحصل توافق», no refund)
 * Items never carry the other person's raw decision or the row's status, only these derived flags.
 * A «لا» is therefore seen only by someone who had already said «مهتم»; for everyone else the card
 * simply disappears.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { calculateCompatibility } from "@/lib/matching/score";
import { suggestionReason } from "@/lib/matching/reasons";
import { expireMutualSuggestions, openMutualWhere } from "@/lib/suggestions/mutual";
import { isUnavailable } from "@/lib/matches/state";
import { getCycleFlags, type CycleFlags } from "@/lib/settings";
import type { FeedCandidate, FeedItem, FeedKind, FeedTab } from "@/lib/suggestions/feed-types";

const LEGACY_SENT_VISIBLE_MS = 14 * 24 * 60 * 60 * 1000;
export type { FeedCandidate, FeedItem, FeedKind, FeedTab, OpenFeedItem } from "@/lib/suggestions/feed-types";

const SOURCE_LIMIT = 50;
/**
 * «جديدة» shows at most this many cards, the best in the feed order (recently active first, then score): on production
 * (2026-11-04) men held a median of 24 open cards (up to 132) and ~14,000 cards a week expired undecided. Answering one
 * lets the next in line in. «مهتمون بك» and «بانتظار ردهم» are not limited.
 */
export const NEW_TAB_LIMIT = 15;

/**
 * «جديدة» and «مهتمون بك» show people by how recently they used Naseebak first — active in the last 3 days, then
 * 3–7 days, then longer (never hidden) — and by the order below inside each group. On production (2026-11-04) a
 * «مهتم» to someone active within a day became a match 41% of the time, 12% for someone away 7+ days.
 */
export const ACTIVITY_GROUP_DAYS = [3, 7] as const;
/**
 * Switch `feed_active_first` (2026-11-07): a finer top group, active in the last day. On production a «مهتم» given
 * 3–7 Nov to someone active that same day was answered 35% of the time so far, 5% when they were last seen 1–2 days before.
 */
export const ACTIVE_FIRST_GROUP_DAYS = [1, 3, 7] as const;
type GroupDays = readonly number[];
/**
 * Switch `feed_active_first`: in «جديدة», someone with this many «مهتم» already waiting for their answer goes after
 * everyone else in their activity group (never hidden). On production (24 Oct – 4 Nov) a man's «مهتم» became a match
 * 32% of the time when nothing waited on her, 12% with 1–4 waiting, 6% with 5–9 and 3% with 20+.
 */
export const BUSY_WAITING = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What a card says about the other person's activity: only these two rough labels, never a time (nobody can watch
 * when someone is online, and `lastActiveAt` only updates hourly). Older activity says nothing rather than something negative.
 */
export function activityLabel(lastActiveAt: Date | null | undefined, gender: string, now = new Date()): string | null {
  if (!lastActiveAt) return null;
  const days = (now.getTime() - lastActiveAt.getTime()) / DAY_MS;
  const active = gender === "FEMALE" ? "نشطة" : "نشط";
  if (days <= 1) return `${active} اليوم`;
  return days <= 7 ? `${active} هذا الأسبوع` : null;
}

/** 0 = active in the last 3 days, 1 = 3–7 days ago, 2 = longer ago or never seen (with the default groups) */
export function activityGroup(lastActiveAt: Date | null | undefined, now = new Date(), groupDays: GroupDays = ACTIVITY_GROUP_DAYS): number {
  if (!lastActiveAt) return groupDays.length;
  const days = (now.getTime() - lastActiveAt.getTime()) / DAY_MS;
  const group = groupDays.findIndex((d) => days <= d);
  return group === -1 ? groupDays.length : group;
}

/** The other person (whichever side of the card I'm on) was last active in this group */
function otherInGroupWhere(userId: string, group: number, now: Date, groupDays: GroupDays): Prisma.SuggestionWhereInput {
  const at = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const lastActiveAt: Prisma.UserWhereInput =
    group === 0
      ? { lastActiveAt: { gte: at(groupDays[0]) } }
      : group < groupDays.length
        ? { lastActiveAt: { gte: at(groupDays[group]), lt: at(groupDays[group - 1]) } }
        : { OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: at(groupDays[groupDays.length - 1]) } }] };
  return { OR: [{ recipientId: userId, candidate: lastActiveAt }, { candidateId: userId, recipient: lastActiveAt }] };
}

/**
 * How many «مهتم» wait for each of these people's answer: open shared cards where the other side said «مهتم» and
 * they haven't decided. Read only for ordering; never sent to a client.
 */
async function waitingInterests(ids: string[], now: Date): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const open = { flow: "MUTUAL" as const, status: "PENDING" as const, expiresAt: { gt: now } };
  // A «مهتم» from someone who has since left or was suspended is hidden from them, so it doesn't make them busy
  const stillHere = { isDeactivated: false, status: { not: "SUSPENDED" as const } };
  const [asCandidate, asRecipient] = await Promise.all([
    db.suggestion.groupBy({
      by: ["candidateId"],
      where: { ...open, candidateId: { in: ids }, recipientDecision: "INTERESTED", candidateDecision: null, recipient: stillHere },
      _count: { _all: true },
    }),
    db.suggestion.groupBy({
      by: ["recipientId"],
      where: { ...open, recipientId: { in: ids }, candidateDecision: "INTERESTED", recipientDecision: null, candidate: stillHere },
      _count: { _all: true },
    }),
  ]);
  for (const g of asCandidate) counts.set(g.candidateId, (counts.get(g.candidateId) ?? 0) + g._count._all);
  for (const g of asRecipient) counts.set(g.recipientId, (counts.get(g.recipientId) ?? 0) + g._count._all);
  return counts;
}

/** Order: newest first; credit-on-interest shows the best matches first (newest first among equals). */
export function suggestionOrder(flags: CycleFlags) {
  return flags.creditOnInterest
    ? [{ compatibilityScore: "desc" as const }, { createdAt: "desc" as const }]
    : [{ createdAt: "desc" as const }];
}

const personSelect = {
  id: true,
  firstName: true,
  isVerified: true,
  gender: true,
  // Only to leave out people who are no longer available; never sent to the client
  isDeactivated: true,
  status: true,
  // To sort by recent activity and for the rough label; the time itself is never sent to the client
  lastActiveAt: true,
  profile: true,
  personalityResult: { select: { vector: true } },
} as const;

/** countOnly: just enough to apply the feed's filters (blocked, unavailable) */
const countSelect = { id: true, isDeactivated: true, status: true, lastActiveAt: true } as const;

type Person = {
  id: string;
  firstName: string;
  isVerified: boolean;
  gender: string;
  isDeactivated?: boolean;
  status?: string;
  lastActiveAt?: Date | null;
  profile: Record<string, unknown> | null;
  personalityResult: { vector: number[] } | null;
};

// Only public profile fields — never preferences, dealbreakers or anything private
const CARD_FIELDS = [
  "city", "area", "nationality", "education", "fieldOfStudy", "job", "incomeRange", "height", "weight",
  "skinColor", "maritalStatus", "religiosity", "smokingStatus", "aboutMe", "hobbies", "interests", "lifestyle",
  "beard", "hijab", "tribe", "familyOriginArea", "numberOfSiblings", "housingType", "cookingAbility",
  "drivingLicense", "willingToRelocate", "familyValues",
] as const;

export function toFeedCandidate(p: Person): FeedCandidate {
  const prof = p.profile ?? {};
  const dob = prof.dateOfBirth as Date | string | null | undefined;
  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const fields = Object.fromEntries(CARD_FIELDS.map((k) => [k, (prof[k] as unknown) ?? null]));
  return {
    id: p.id,
    firstName: p.firstName,
    isVerified: p.isVerified,
    age,
    childrenCount: (prof.childrenCount as number | undefined) ?? 0,
    ...(fields as Omit<FeedCandidate, "id" | "firstName" | "isVerified" | "age" | "childrenCount">),
  };
}

async function blockedIdsOf(userId: string): Promise<Set<string>> {
  const blocks = await db.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]).filter((id) => id !== userId));
}

/** Does this user still have a MUTUAL suggestion to decide? (keeps the two-tab view after a switch-off) */
export async function hasOpenMutual(userId: string): Promise<boolean> {
  return (await db.suggestion.count({ where: openMutualWhere(userId) })) > 0;
}

/**
 * Cheap badge counts for the shared flow, same rules as the feed's MUTUAL rows (openMutualWhere,
 * blocked people left out): `fresh` = nobody answered yet («الجديد»), `likedYou` = the other side said
 * «مهتم» and I haven't decided («مهتمون بالتحدث معك»). Two COUNT queries — safe for the 30-second poll.
 */
export async function countMutualTabs(userId: string, now = new Date()): Promise<{ fresh: number; likedYou: number }> {
  const blocked = [...(await blockedIdsOf(userId))];
  const where = (theirs: "INTERESTED" | null) => {
    const base = openMutualWhere(userId, now);
    const [asRecipient, asCandidate] = base.OR as Prisma.SuggestionWhereInput[];
    return {
      ...base,
      OR: [
        { ...asRecipient, candidateDecision: theirs, ...(blocked.length && { candidateId: { notIn: blocked } }) },
        { ...asCandidate, recipientDecision: theirs, ...(blocked.length && { recipientId: { notIn: blocked } }) },
      ],
    };
  };
  const [fresh, likedYou] = await Promise.all([
    db.suggestion.count({ where: where(null) }),
    db.suggestion.count({ where: where("INTERESTED") }),
  ]);
  return { fresh: Math.min(fresh, NEW_TAB_LIMIT), likedYou };
}

/** Cards still to decide: the "new" and "interested" tabs together (dashboard card, next step). */
export async function countNewItems(userId: string): Promise<number> {
  // Credit on interest: both tabs hold only MUTUAL rows (legacy cards are closed), so the badge
  // COUNTs give the same total without loading two full feeds. Capped like the feed's source query.
  if ((await getCycleFlags()).creditOnInterest) {
    await expireMutualSuggestions(userId);
    const { fresh, likedYou } = await countMutualTabs(userId);
    return Math.min(fresh + likedYou, SOURCE_LIMIT);
  }
  const [fresh, interested] = await Promise.all([
    getSuggestionFeed(userId, "new", 1, 1, { countOnly: true }),
    getSuggestionFeed(userId, "interested", 1, 1, { countOnly: true }),
  ]);
  return fresh.total + interested.total;
}

export async function getSuggestionFeed(
  userId: string,
  tab: FeedTab,
  page: number,
  pageSize = 10,
  /** countOnly: the same total without loading profiles or building cards (`items` is empty) */
  opts: { countOnly?: boolean } = {}
): Promise<{ items: FeedItem[]; page: number; totalPages: number; total: number }> {
  await expireMutualSuggestions(userId);
  const now = new Date();
  const flags = await getCycleFlags();
  const order = suggestionOrder(flags);
  const groupDays: GroupDays = flags.activeFirstFeed ? ACTIVE_FIRST_GROUP_DAYS : ACTIVITY_GROUP_DAYS;
  const otherSelect = opts.countOnly ? countSelect : personSelect;

  const [viewer, blocked] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { ...personSelect, matchCredits: true } }),
    blockedIdsOf(userId),
  ]);
  if (!viewer) return { items: [], page, totalPages: 0, total: 0 };

  type Row = {
    kind: FeedKind; id: string; score: number | null; createdAt: Date; other: Person;
    likedYou?: boolean;
    declined?: boolean;
    expiresAt?: Date | null;
  };
  const rows: Row[] = [];
  const mutualSelect = {
    id: true, compatibilityScore: true, createdAt: true, recipientId: true, expiresAt: true,
    // Read only for the derived likedYou / declined flags; never sent to the client
    recipientDecision: true, candidateDecision: true,
    recipient: { select: otherSelect }, candidate: { select: otherSelect },
  } as const;
  const otherOf = (s: { recipientId: string; recipient: Person; candidate: Person }) =>
    s.recipientId === userId ? s.candidate : s.recipient;

  if (tab === "new" || tab === "interested") {
    const interestedTab = tab === "interested";
    const [mutualGroups, legacy, likes, myResponses] = await Promise.all([
      // Each activity group on its own, so a member with many cards never loses the active ones past the limit
      Promise.all(
        Array.from({ length: groupDays.length + 1 }, (_, group) => group).map((group) =>
          db.suggestion.findMany({
            where: { AND: [openMutualWhere(userId, now), otherInGroupWhere(userId, group, now, groupDays)] },
            select: mutualSelect,
            orderBy: order,
            take: SOURCE_LIMIT,
          })
        )
      ),
      db.suggestion.findMany({
        where: { flow: "LEGACY", recipientId: userId, status: "PENDING" },
        select: { id: true, compatibilityScore: true, createdAt: true, candidate: { select: otherSelect } },
        orderBy: { createdAt: "desc" },
        take: SOURCE_LIMIT,
      }),
      db.like.findMany({
        where: { toUserId: userId, isLiked: true },
        select: { id: true, createdAt: true, suggestionId: true, fromUser: { select: otherSelect } },
        orderBy: { createdAt: "desc" },
        take: SOURCE_LIMIT,
      }),
      db.like.findMany({ where: { fromUserId: userId }, select: { toUserId: true } }),
    ]);
    const answered = new Set(myResponses.map((r) => r.toUserId));
    for (const s of mutualGroups.flat()) {
      const theirDecision = s.recipientId === userId ? s.candidateDecision : s.recipientDecision;
      // (a DECLINED other side never reaches here: a «لا» closes the row as REJECTED at once)
      if ((theirDecision === "INTERESTED") !== interestedTab) continue;
      rows.push({
        kind: "mutual", id: s.id, score: s.compatibilityScore, createdAt: s.createdAt, other: otherOf(s as never),
        expiresAt: s.expiresAt,
        ...(interestedTab && { likedYou: true }),
      });
    }
    // Credit on interest: older-style cards are closed (closeLegacyInFlight), shared flow only
    const legacyOpen = !flags.creditOnInterest;
    if (legacyOpen && !interestedTab) for (const s of legacy) rows.push({ kind: "legacy_suggestion", id: s.id, score: s.compatibilityScore, createdAt: s.createdAt, other: s.candidate as Person });
    if (legacyOpen && interestedTab) for (const l of likes) {
      if (answered.has(l.fromUser.id)) continue;
      rows.push({ kind: "legacy_interest", id: l.id, score: null, createdAt: l.createdAt, other: l.fromUser as Person, likedYou: true });
    }
  } else {
    // Legacy sent interests keep their old 14-day "waiting" window
    const since = new Date(now.getTime() - LEGACY_SENT_VISIBLE_MS);
    const [mutual, legacySent, matches] = await Promise.all([
      db.suggestion.findMany({
        where: {
          flow: "MUTUAL",
          // REJECTED too: a «لا» from the other side stays visible as «لم يحصل توافق» until the window ends
          status: { in: ["PENDING", "REJECTED"] },
          expiresAt: { gt: now },
          OR: [
            { recipientId: userId, recipientDecision: "INTERESTED" },
            { candidateId: userId, candidateDecision: "INTERESTED" },
          ],
        },
        select: mutualSelect,
        orderBy: order,
        take: SOURCE_LIMIT,
      }),
      db.suggestion.findMany({
        where: { flow: "LEGACY", recipientId: userId, status: "ACCEPTED", updatedAt: { gt: since } },
        select: { id: true, compatibilityScore: true, updatedAt: true, candidate: { select: otherSelect } },
        orderBy: { updatedAt: "desc" },
        take: SOURCE_LIMIT,
      }),
      db.mutualMatch.findMany({
        where: { OR: [{ femaleId: userId }, { maleId: userId }] },
        select: { femaleId: true, maleId: true },
      }),
    ]);
    const matched = new Set(matches.flatMap((m) => [m.femaleId, m.maleId]));
    for (const s of mutual) {
      const theirDecision = s.recipientId === userId ? s.candidateDecision : s.recipientDecision;
      rows.push({
        kind: "mutual", id: s.id, score: s.compatibilityScore, createdAt: s.createdAt, other: otherOf(s as never), expiresAt: s.expiresAt,
        ...(theirDecision === "DECLINED" && { declined: true }),
      });
    }
    if (!flags.creditOnInterest) for (const s of legacySent) {
      if (matched.has(s.candidate.id)) continue;
      rows.push({ kind: "legacy_sent", id: s.id, score: s.compatibilityScore, createdAt: s.updatedAt, other: s.candidate as Person });
    }
  }

  // My «مهتم» already sent (the third tab) stays in its own order
  const byActivity = tab === "new" || tab === "interested";
  // «جديدة» with `feed_active_first`: people already holding BUSY_WAITING+ «مهتم» go last in their activity group.
  // Not for countOnly: the order never changes how many cards show.
  const waiting =
    tab === "new" && flags.activeFirstFeed && !opts.countOnly
      ? await waitingInterests([...new Set(rows.filter((r) => r.kind === "mutual").map((r) => r.other.id))], now)
      : null;
  const busy = (r: Row) => (waiting && (waiting.get(r.other.id) ?? 0) >= BUSY_WAITING ? 1 : 0);
  const visible = rows
    // Blocked either way, or deactivated / suspended since the suggestion was made
    .filter((r) => !blocked.has(r.other.id) && !isUnavailable(r.other))
    .sort((a, b) =>
      (byActivity ? activityGroup(a.other.lastActiveAt, now, groupDays) - activityGroup(b.other.lastActiveAt, now, groupDays) : 0) ||
      busy(a) - busy(b) ||
      (flags.creditOnInterest
        ? (b.score ?? -1) - (a.score ?? -1) || b.createdAt.getTime() - a.createdAt.getTime()
        : b.createdAt.getTime() - a.createdAt.getTime())
    );
  if (tab === "new") visible.splice(NEW_TAB_LIMIT);
  const total = visible.length;
  if (opts.countOnly) return { items: [], page, totalPages: Math.ceil(total / pageSize), total };
  const items = visible.slice((page - 1) * pageSize, page * pageSize).map((r): FeedItem => {
    const v = viewer as unknown as Parameters<typeof suggestionReason>[0];
    const o = r.other as unknown as Parameters<typeof suggestionReason>[1];
    const activity = activityLabel(r.other.lastActiveAt, r.other.gender, now);
    return {
      kind: r.kind,
      id: r.id,
      compatibilityScore: r.score ?? calculateCompatibility(v, o),
      reason: suggestionReason(v, o),
      createdAt: r.createdAt.toISOString(),
      candidate: toFeedCandidate(r.other),
      ...(activity && { activity }),
      ...(r.expiresAt && { expiresAt: r.expiresAt.toISOString() }),
      ...(r.likedYou && { likedYou: true as const }),
      ...(r.declined && { declined: true as const }),
    };
  });
  return { items, page, totalPages: Math.ceil(total / pageSize), total };
}
