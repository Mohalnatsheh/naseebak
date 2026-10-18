/**
 * Daily scheduler — simultaneous suggestions and the weekly free suggestions.
 * Expiry matches the lazy path (`expireMutualSuggestions`), reminders never reveal the other side's
 * decision (a row the other side declined gets no reminder: it can't become a match), and new weekly
 * suggestions go through `autoSuggestForUser`, which applies every rule and sends the notifications.
 */
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { getCycleFlags } from "@/lib/settings";
import { isUnavailable } from "@/lib/matches/state";
import { activeWhere } from "@/lib/activity";
import { MAX_OPEN_SUGGESTIONS, autoSuggestForUser, openCounts, weeklyCounts } from "@/lib/matching/auto-suggest";
import { WEEKLY_FREE_SUGGESTIONS } from "@/lib/credits";
import { refundUnansweredInterests } from "@/lib/suggestions/mutual";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SUGGESTION_REMIND_BEFORE_DAYS = 2;
/** Users handed to autoSuggestForUser per run (sequential; the rest are picked up the next day or lazily) */
export const WEEKLY_SUGGEST_LIMIT = 150;
const BATCH = 500;

const partySelect = { select: { id: true, gender: true, isDeactivated: true, status: true } } as const;

/** Close every MUTUAL row past its 7 days (same as the lazy per-user path). */
export async function expireMutualSuggestionsAll(now = new Date()): Promise<{ expired: number; refunded: number }> {
  const { count } = await db.suggestion.updateMany({
    where: { flow: "MUTUAL", status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  // Also catches rows closed lazily whose refund didn't run (each refund happens once)
  const { refunded } = await refundUnansweredInterests({ now });
  return { expired: count, refunded };
}

/** One reminder per suggestion, to each side that hasn't decided, when ≤2 days are left. */
export async function remindMutualSuggestions(now = new Date()): Promise<{ suggestions: number; reminded: number }> {
  const due = await db.suggestion.findMany({
    where: {
      flow: "MUTUAL",
      status: "PENDING",
      reminderSentAt: null,
      expiresAt: { gt: now, lte: new Date(now.getTime() + SUGGESTION_REMIND_BEFORE_DAYS * DAY_MS) },
      OR: [{ recipientDecision: null }, { candidateDecision: null }],
    },
    select: {
      id: true, recipientId: true, candidateId: true, recipientDecision: true, candidateDecision: true,
      hiddenFromCandidate: true, recipient: partySelect, candidate: partySelect,
    },
    orderBy: { expiresAt: "asc" },
    take: BATCH,
  });

  let suggestions = 0;
  let reminded = 0;
  for (const s of due) {
    const claimed = await db.suggestion.updateMany({
      where: { id: s.id, status: "PENDING", reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count !== 1) continue;
    // The feed hides rows with someone inactive or blocked: nothing to remind about
    if (isUnavailable(s.recipient) || isUnavailable(s.candidate)) continue;
    const block = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: s.recipientId, blockedId: s.candidateId },
          { blockerId: s.candidateId, blockedId: s.recipientId },
        ],
      },
      select: { id: true },
    });
    if (block) continue;
    // One side already said «لا»: it can't become a match, so don't push the other to spend a credit on it
    if (s.recipientDecision === "DECLINED" || s.candidateDecision === "DECLINED") continue;

    suggestions++;
    const undecided = [
      ...(s.recipientDecision === null ? [s.recipient] : []),
      // A card the candidate can't see yet (made while they were full) is never reminded to them
      ...(s.candidateDecision === null && !s.hiddenFromCandidate ? [s.candidate] : []),
    ];
    for (const person of undecided) {
      const female = person.gender === "FEMALE";
      await notify({
        userId: person.id,
        type: "SUGGESTION",
        title: "اقتراح بانتظار قرارك",
        body: female
          ? "بقي يومان أو أقل على انتهاء اقتراح توافق لم تقرّري فيه بعد. اطّلعي عليه الآن."
          : "بقي يومان أو أقل على انتهاء اقتراح توافق لم تقرّر فيه بعد. اطّلع عليه الآن.",
        url: "/dashboard/suggestions",
        metadata: { suggestionId: s.id },
      });
      reminded++;
    }
  }
  return { suggestions, reminded };
}

/**
 * Weekly free suggestions for everyone who can get them: eligible (finished setup), active in the last
 * 30 days, not flagged / deactivated / suspended, under the weekly cap. autoSuggestForUser re-checks
 * all of that (and "nothing undecided") and notifies. Per-request mode only: in legacy mode a suggestion
 * costs a credit, so it stays something the user triggers by visiting.
 */
export async function runWeeklySuggestions(
  now = new Date(),
  limit = WEEKLY_SUGGEST_LIMIT
): Promise<{ skipped?: "switch_off"; eligible: number; processed: number; created: number; failed: number }> {
  const flags = await getCycleFlags();
  if (!flags.introRequests) return { skipped: "switch_off", eligible: 0, processed: 0, created: 0, failed: 0 };

  const users = await db.user.findMany({
    where: {
      role: "USER",
      isDeactivated: false,
      status: { not: "SUSPENDED" },
      isFlagged: false,
      profile: { isComplete: true },
      ...activeWhere(30, now),
    },
    select: { id: true },
    orderBy: { lastActiveAt: { sort: "desc", nulls: "last" } },
  });
  if (users.length === 0) return { eligible: 0, processed: 0, created: 0, failed: 0 };

  // Skip people already at the weekly cap without running the full candidate scan for them
  // (credit-on-interest: skip those already holding MAX_OPEN_SUGGESTIONS undecided ones instead)
  const ids = users.map((u) => u.id);
  const counts = flags.creditOnInterest ? await openCounts(ids) : await weeklyCounts(ids, new Date(now.getTime() - 7 * DAY_MS));
  const cap = flags.creditOnInterest ? MAX_OPEN_SUGGESTIONS : WEEKLY_FREE_SUGGESTIONS;
  const underCap = users.filter((u) => (counts.get(u.id) ?? 0) < cap);

  let processed = 0;
  let created = 0;
  let failed = 0;
  for (const u of underCap.slice(0, limit)) {
    processed++;
    try {
      created += await autoSuggestForUser(u.id);
    } catch (error) {
      failed++;
      console.error(`[cron] weekly suggestions for ${u.id}:`, error);
    }
  }
  return { eligible: underCap.length, processed, created, failed };
}

/**
 * Both said «مهتم» (row ACCEPTED) but creating the match failed: create it now. Without this the pair
 * is charged and stuck with no match. Skips people who left or blocked each other since.
 */
export async function healMissingMatches(now = new Date()): Promise<{ healed: number }> {
  const rows = await db.suggestion.findMany({
    where: {
      flow: "MUTUAL",
      status: "ACCEPTED",
      recipientDecision: "INTERESTED",
      candidateDecision: "INTERESTED",
      updatedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
    },
    select: { id: true, recipientId: true, candidateId: true, recipient: partySelect, candidate: partySelect },
    take: BATCH,
  });
  let healed = 0;
  for (const s of rows) {
    const female = s.recipient.gender === "FEMALE" ? s.recipient : s.candidate;
    const male = female.id === s.recipientId ? s.candidate : s.recipient;
    const exists = await db.mutualMatch.findFirst({ where: { femaleId: female.id, maleId: male.id }, select: { id: true } });
    if (exists || isUnavailable(female) || isUnavailable(male)) continue;
    const block = await db.block.findFirst({
      where: { OR: [{ blockerId: female.id, blockedId: male.id }, { blockerId: male.id, blockedId: female.id }] },
      select: { id: true },
    });
    if (block) continue;
    try {
      const { createMutualMatch } = await import("@/lib/intro/match");
      await createMutualMatch({ femaleId: female.id, maleId: male.id, suggestionId: s.id });
      healed++;
    } catch (e) {
      console.error("[cron] heal match", s.id, e);
    }
  }
  return { healed };
}
