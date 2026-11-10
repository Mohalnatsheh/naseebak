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
import { CANDIDATE_ACTIVE_DAYS, activeWhere } from "@/lib/activity";
import { MAX_OPEN_SUGGESTIONS, autoSuggestForUser, openCounts, weeklyCounts } from "@/lib/matching/auto-suggest";
import { WEEKLY_FREE_SUGGESTIONS } from "@/lib/credits";
import { refundUnansweredInterests } from "@/lib/suggestions/mutual";
import { startOfAmmanDay } from "@/lib/amman-day";
import { replyNoticeLine } from "@/lib/payments/topup-prompt";
import { WEEKLY_SUGGEST_LIMIT } from "@/lib/cron/suggest-limit";

/** Same titles as the waiting nudge and the hidden-card reveal in suggestions/mutual.ts */
const WAITING_TITLE = "اقتراح بانتظار قرارك";
const INTEREST_SHOWN_TITLE = "شخص أبدى اهتمامه بك";
export const LIKED_WAITING_TITLE = "شخص ينتظر ردّك";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SUGGESTION_REMIND_BEFORE_DAYS = 2;
// One source for the cap (db-free, shared with the admin page): see suggest-limit.ts
export { WEEKLY_SUGGEST_LIMIT };
const BATCH = 500;
/** One run of the expiry reminder: about 2,000 cards a day expire, this leaves room for a backlog */
const MAX_REMINDER_PAGES = 20;

const partySelect = { select: { id: true, gender: true, isDeactivated: true, status: true } } as const;

/**
 * Close every MUTUAL row past its 7 days (same as the lazy per-user path), and older rows where one
 * side already said «لا» (from before «لا» closed the card at once) as REJECTED, never refunded.
 */
export async function expireMutualSuggestionsAll(
  now = new Date()
): Promise<{ expired: number; rejected: number; refunded: number }> {
  const { count: rejected } = await db.suggestion.updateMany({
    where: {
      flow: "MUTUAL",
      status: "PENDING",
      OR: [{ recipientDecision: "DECLINED" }, { candidateDecision: "DECLINED" }],
    },
    data: { status: "REJECTED" },
  });
  const { count } = await db.suggestion.updateMany({
    where: { flow: "MUTUAL", status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  // Also catches rows closed lazily whose refund didn't run (each refund happens once)
  const { refunded } = await refundUnansweredInterests({ now });
  return { expired: count, rejected, refunded };
}

/** One reminder per suggestion, to each side that hasn't decided, when ≤2 days are left. */
export async function remindMutualSuggestions(now = new Date()): Promise<{ suggestions: number; reminded: number }> {
  const nextPage = () => db.suggestion.findMany({
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
  // One «اقتراح بانتظار قرارك» per person per Amman day, whatever sent it: this reminder (one per run,
  // not one per card), the waiting nudge (notifyWaitingDecision) or the «شخص أبدى اهتمامه بك» reveal
  const told = new Set<string>();
  const toldToday = async (userId: string): Promise<boolean> => {
    if (told.has(userId)) return true;
    const today = await db.notification.findFirst({
      where: { userId, title: { in: [WAITING_TITLE, INTEREST_SHOWN_TITLE, LIKED_WAITING_TITLE] }, createdAt: { gte: startOfAmmanDay(now) } },
      select: { id: true },
    });
    if (today) told.add(userId);
    return !!today;
  };
  // Every due card, page by page: each one is stamped below, so the next page moves on
  for (let page = 0; page < MAX_REMINDER_PAGES; page++) {
    const due = await nextPage();
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
        if (await toldToday(person.id)) continue;
        told.add(person.id);
        const female = person.gender === "FEMALE";
        await notify({
          userId: person.id,
          type: "SUGGESTION",
          title: WAITING_TITLE,
          oncePerDay: "waiting-decision",
          body: female
            ? "بقي يومان أو أقل على انتهاء اقتراح توافق لم تقرّري فيه بعد. اطّلعي عليه الآن."
            : "بقي يومان أو أقل على انتهاء اقتراح توافق لم تقرّر فيه بعد. اطّلع عليه الآن.",
          url: "/dashboard/suggestions",
          metadata: { suggestionId: s.id },
        });
        reminded++;
      }
    }
    if (due.length < BATCH) break;
  }
  return { suggestions, reminded };
}

/** Away at least this long (and seen within the last month) before «شخص ينتظر ردّك»; also the gap between two */
export const LIKED_WAITING_IDLE_DAYS = 2;

/**
 * Evening reminder (owner decision 2026-11-04): a member away LIKED_WAITING_IDLE_DAYS+ days who has an open card
 * where the other person already said «مهتم» gets one push + bell «شخص ينتظر ردّك» (no SMS, ever). At most once per
 * LIKED_WAITING_IDLE_DAYS per person, and not when any suggestion notice reached them in that time. On 4 Nov,
 * 96 women and 78 men away 3+ days had such a card; the 7-day re-engagement push came too late for it.
 */
export async function remindWaitingInterest(now = new Date()): Promise<{ members: number; reminded: number }> {
  const idleSince = new Date(now.getTime() - LIKED_WAITING_IDLE_DAYS * DAY_MS);
  const seenSince = new Date(now.getTime() - 30 * DAY_MS);
  const away = { lastActiveAt: { lt: idleSince, gte: seenSince }, isDeactivated: false, status: { not: "SUSPENDED" as const } };
  const cards = await db.suggestion.findMany({
    where: {
      flow: "MUTUAL",
      status: "PENDING",
      expiresAt: { gt: now },
      OR: [
        { recipientDecision: null, candidateDecision: "INTERESTED", recipient: away },
        { candidateDecision: null, recipientDecision: "INTERESTED", hiddenFromCandidate: false, candidate: away },
      ],
    },
    select: { recipientId: true, candidateId: true, recipientDecision: true, recipient: partySelect, candidate: partySelect },
    take: BATCH * 4,
  });

  // The member who still has to answer, once each (their partner must still be available)
  const waiting = new Map<string, { gender: string; others: string[] }>();
  for (const c of cards) {
    const iAmRecipient = c.recipientDecision === null;
    const me = iAmRecipient ? c.recipient : c.candidate;
    const other = iAmRecipient ? c.candidate : c.recipient;
    if (isUnavailable(other)) continue;
    const entry = waiting.get(me.id) ?? { gender: me.gender, others: [] };
    entry.others.push(other.id);
    waiting.set(me.id, entry);
  }

  let reminded = 0;
  for (const [userId, { gender, others }] of waiting) {
    const blocked = await db.block.findFirst({
      where: { OR: [{ blockerId: userId, blockedId: { in: others } }, { blockerId: { in: others }, blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    // Every waiting card is with someone in a block: nothing to answer
    if (blocked && others.every((o) => o === blocked.blockerId || o === blocked.blockedId)) continue;
    const recent = await db.notification.findFirst({
      where: { userId, title: { in: [WAITING_TITLE, INTEREST_SHOWN_TITLE, LIKED_WAITING_TITLE] }, createdAt: { gte: idleSince } },
      select: { id: true },
    });
    if (recent) continue;
    const female = gender === "FEMALE";
    const member = await db.user.findUnique({ where: { id: userId }, select: { matchCredits: true, country: true, gender: true, phone: true } });
    const topUp = member ? ((await replyNoticeLine(member).catch(() => null)) ?? "") : "";
    await notify({
      userId,
      type: "SUGGESTION",
      title: LIKED_WAITING_TITLE,
      body:
        (female
          ? "أحدهم قال «مهتم» لكِ وما زال ينتظر قراركِ. ادخلي وشاهدي الاقتراح قبل انتهاء مدته."
          : "أحدهم قال «مهتم» لك وما زال ينتظر قرارك. ادخل وشاهد الاقتراح قبل انتهاء مدته.") + topUp,
      url: "/dashboard/suggestions?tab=interested",
      sms: false,
    });
    reminded++;
  }
  return { members: waiting.size, reminded };
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
      // Credit on interest: `generate` skips anyone away 7+ days, so they must not use up the run's limit
      ...activeWhere(flags.creditOnInterest ? CANDIDATE_ACTIVE_DAYS : 30, now),
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
 * is charged and stuck with no match. Oldest first; rows that can't be healed (someone left or was
 * suspended) are filtered in the query, and the window is paged through so matched / blocked pairs
 * never starve the live rows behind them.
 */
export async function healMissingMatches(now = new Date()): Promise<{ healed: number }> {
  const available = { isDeactivated: false, status: { not: "SUSPENDED" as const } };
  const where = {
    flow: "MUTUAL" as const,
    status: "ACCEPTED" as const,
    recipientDecision: "INTERESTED" as const,
    candidateDecision: "INTERESTED" as const,
    updatedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
    recipient: available,
    candidate: available,
  };
  let healed = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.suggestion.findMany({
      where,
      select: { id: true, recipientId: true, candidateId: true, recipient: partySelect, candidate: partySelect },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    // One lookup per page: pairs that already have a match, and blocks between any of the people
    const pairs = rows.map((s) => {
      const female = s.recipient.gender === "FEMALE" ? s.recipient : s.candidate;
      const male = female.id === s.recipientId ? s.candidate : s.recipient;
      return { s, female, male };
    });
    const people = [...new Set(pairs.flatMap((p) => [p.female.id, p.male.id]))];
    const [matches, blocks] = await Promise.all([
      db.mutualMatch.findMany({
        where: { femaleId: { in: people }, maleId: { in: people } },
        select: { femaleId: true, maleId: true },
      }),
      db.block.findMany({
        where: { blockerId: { in: people }, blockedId: { in: people } },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const matched = new Set(matches.map((m) => `${m.femaleId}:${m.maleId}`));
    const blocked = new Set(blocks.flatMap((b) => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`]));

    for (const { s, female, male } of pairs) {
      if (matched.has(`${female.id}:${male.id}`) || blocked.has(`${female.id}:${male.id}`)) continue;
      if (isUnavailable(female) || isUnavailable(male)) continue;
      try {
        const { createMutualMatch } = await import("@/lib/intro/match");
        await createMutualMatch({ femaleId: female.id, maleId: male.id, suggestionId: s.id });
        healed++;
      } catch (e) {
        console.error("[cron] heal match", s.id, e);
      }
    }
    if (rows.length < BATCH) break;
  }
  return { healed };
}
