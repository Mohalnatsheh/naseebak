/**
 * The two-tab suggestions feed (simultaneous flow), per viewer:
 *   new     — what I still have to decide: MUTUAL rows, plus legacy suggestions and interests in flight
 *   waiting — what I said "مهتم" to and isn't a match (yet): MUTUAL rows until they expire, plus legacy sent
 * Items never carry the other person's decision or the row's status.
 */
import { db } from "@/lib/db";
import { calculateCompatibility } from "@/lib/matching/score";
import { suggestionReason } from "@/lib/matching/reasons";
import { MUTUAL_SUGGESTION_MS, expireMutualSuggestions, openMutualWhere } from "@/lib/suggestions/mutual";
import { isUnavailable } from "@/lib/matches/state";
import { getCycleFlags, type CycleFlags } from "@/lib/settings";

export type FeedTab = "new" | "waiting";
export type FeedKind = "mutual" | "legacy_suggestion" | "legacy_interest" | "legacy_sent";

const SOURCE_LIMIT = 50;

/** Feed order: today newest first; credit-on-interest shows the best matches first (newest first among equals). */
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
  profile: true,
  personalityResult: { select: { vector: true } },
} as const;

type Person = {
  id: string;
  firstName: string;
  isVerified: boolean;
  gender: string;
  isDeactivated?: boolean;
  status?: string;
  profile: Record<string, unknown> | null;
  personalityResult: { vector: number[] } | null;
};

export interface FeedCandidate {
  id: string;
  firstName: string;
  isVerified: boolean;
  age: number | null;
  city: string | null;
  area: string | null;
  nationality: string | null;
  education: string | null;
  fieldOfStudy: string | null;
  job: string | null;
  incomeRange: string | null;
  height: number | null;
  weight: number | null;
  skinColor: string | null;
  maritalStatus: string | null;
  childrenCount: number;
  religiosity: string | null;
  smokingStatus: string | null;
  aboutMe: string | null;
  hobbies: string | null;
  interests: string | null;
  lifestyle: string | null;
  beard: boolean | null;
  hijab: boolean | null;
  tribe: string | null;
  familyOriginArea: string | null;
  numberOfSiblings: number | null;
  housingType: string | null;
  cookingAbility: string | null;
  drivingLicense: boolean | null;
  willingToRelocate: string | null;
  familyValues: string | null;
}

export interface FeedItem {
  kind: FeedKind;
  /** Suggestion id, or the Like id for legacy_interest */
  id: string;
  compatibilityScore: number;
  reason: string;
  createdAt: string;
  candidate: FeedCandidate;
}

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

/** Number of items in the "new" tab (dashboard card, tab badge). */
export async function countNewItems(userId: string): Promise<number> {
  return (await getSuggestionFeed(userId, "new", 1, 1)).total;
}

export async function getSuggestionFeed(
  userId: string,
  tab: FeedTab,
  page: number,
  pageSize = 10
): Promise<{ items: FeedItem[]; page: number; totalPages: number; total: number }> {
  await expireMutualSuggestions(userId);
  const now = new Date();
  const flags = await getCycleFlags();
  const order = suggestionOrder(flags);

  const [viewer, blocked] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: personSelect }),
    blockedIdsOf(userId),
  ]);
  if (!viewer) return { items: [], page, totalPages: 0, total: 0 };

  const rows: { kind: FeedKind; id: string; score: number | null; createdAt: Date; other: Person }[] = [];
  const mutualSelect = {
    id: true, compatibilityScore: true, createdAt: true, recipientId: true,
    recipient: { select: personSelect }, candidate: { select: personSelect },
  } as const;
  const otherOf = (s: { recipientId: string; recipient: Person; candidate: Person }) =>
    s.recipientId === userId ? s.candidate : s.recipient;

  if (tab === "new") {
    const [mutual, legacy, likes, myResponses] = await Promise.all([
      db.suggestion.findMany({
        where: openMutualWhere(userId, now),
        select: mutualSelect,
        orderBy: order,
        take: SOURCE_LIMIT,
      }),
      db.suggestion.findMany({
        where: { flow: "LEGACY", recipientId: userId, status: "PENDING" },
        select: { id: true, compatibilityScore: true, createdAt: true, candidate: { select: personSelect } },
        orderBy: { createdAt: "desc" },
        take: SOURCE_LIMIT,
      }),
      db.like.findMany({
        where: { toUserId: userId, isLiked: true },
        select: { id: true, createdAt: true, suggestionId: true, fromUser: { select: personSelect } },
        orderBy: { createdAt: "desc" },
        take: SOURCE_LIMIT,
      }),
      db.like.findMany({ where: { fromUserId: userId }, select: { toUserId: true } }),
    ]);
    const answered = new Set(myResponses.map((r) => r.toUserId));
    for (const s of mutual) rows.push({ kind: "mutual", id: s.id, score: s.compatibilityScore, createdAt: s.createdAt, other: otherOf(s as never) });
    for (const s of legacy) rows.push({ kind: "legacy_suggestion", id: s.id, score: s.compatibilityScore, createdAt: s.createdAt, other: s.candidate as Person });
    for (const l of likes) {
      if (answered.has(l.fromUser.id)) continue;
      rows.push({ kind: "legacy_interest", id: l.id, score: null, createdAt: l.createdAt, other: l.fromUser as Person });
    }
  } else {
    const since = new Date(now.getTime() - MUTUAL_SUGGESTION_MS);
    const [mutual, legacySent, matches] = await Promise.all([
      db.suggestion.findMany({
        where: {
          flow: "MUTUAL",
          // REJECTED too: a "لا" from the other side must look exactly like "not yet"
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
        select: { id: true, compatibilityScore: true, updatedAt: true, candidate: { select: personSelect } },
        orderBy: { updatedAt: "desc" },
        take: SOURCE_LIMIT,
      }),
      db.mutualMatch.findMany({
        where: { OR: [{ femaleId: userId }, { maleId: userId }] },
        select: { femaleId: true, maleId: true },
      }),
    ]);
    const matched = new Set(matches.flatMap((m) => [m.femaleId, m.maleId]));
    for (const s of mutual) rows.push({ kind: "mutual", id: s.id, score: s.compatibilityScore, createdAt: s.createdAt, other: otherOf(s as never) });
    for (const s of legacySent) {
      if (matched.has(s.candidate.id)) continue;
      rows.push({ kind: "legacy_sent", id: s.id, score: s.compatibilityScore, createdAt: s.updatedAt, other: s.candidate as Person });
    }
  }

  const visible = rows
    // Blocked either way, or deactivated / suspended since the suggestion was made
    .filter((r) => !blocked.has(r.other.id) && !isUnavailable(r.other))
    .sort((a, b) =>
      flags.creditOnInterest
        ? (b.score ?? -1) - (a.score ?? -1) || b.createdAt.getTime() - a.createdAt.getTime()
        : b.createdAt.getTime() - a.createdAt.getTime()
    );
  const total = visible.length;
  const items = visible.slice((page - 1) * pageSize, page * pageSize).map((r) => {
    const v = viewer as unknown as Parameters<typeof suggestionReason>[0];
    const o = r.other as unknown as Parameters<typeof suggestionReason>[1];
    return {
      kind: r.kind,
      id: r.id,
      compatibilityScore: r.score ?? calculateCompatibility(v, o),
      reason: suggestionReason(v, o),
      createdAt: r.createdAt.toISOString(),
      candidate: toFeedCandidate(r.other),
    };
  });
  return { items, page, totalPages: Math.ceil(total / pageSize), total };
}
