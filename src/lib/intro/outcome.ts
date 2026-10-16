/**
 * Immediate outcome of a mutual match (credit_on_interest): each side chose an introduction
 * when tapping "مهتم" (stored on the suggestion). The match opens straight into it:
 * - both CHAT (chat switch on) → an accepted CHAT request + an open Conversation
 * - both FAMILY, or one of each → an accepted FAMILY request; each FAMILY side is stamped as
 *   sharing its guardian contact on this match
 * - anything else (legacy rows, no preference, chat off with CHAT+CHAT) → "NONE": the match shows
 *   the (free) request buttons.
 * The outcome rows are ordinary accepted IntroRequests so getMatchIntroState stays the one source of truth.
 */
import type { IntroPreference } from "@prisma/client";
import { db } from "@/lib/db";
import type { CycleFlags } from "@/lib/settings";
import { CHAT_TTL_DAYS } from "@/lib/intro/requests";

const DAY_MS = 24 * 60 * 60 * 1000;

export type IntroOutcome = "CHAT" | "FAMILY" | "NONE";

interface OutcomeMatch {
  id: string;
  femaleId: string;
  maleId: string;
  suggestionId: string | null;
}

export interface SidePreferences {
  female: IntroPreference | null;
  male: IntroPreference | null;
}

/** Each side's choice, mapped from the suggestion's recipient/candidate to the match's female/male. */
export async function readIntroPreferences(match: OutcomeMatch): Promise<SidePreferences> {
  if (!match.suggestionId) return { female: null, male: null };
  const s = await db.suggestion.findUnique({
    where: { id: match.suggestionId },
    select: { recipientId: true, candidateId: true, recipientIntroPreference: true, candidateIntroPreference: true },
  });
  if (!s) return { female: null, male: null };
  const of = (userId: string): IntroPreference | null =>
    s.recipientId === userId
      ? (s.recipientIntroPreference ?? null)
      : s.candidateId === userId
        ? (s.candidateIntroPreference ?? null)
        : null;
  return { female: of(match.femaleId), male: of(match.maleId) };
}

export function outcomeFor(prefs: SidePreferences, flags: CycleFlags): IntroOutcome {
  const { female, male } = prefs;
  if (!female || !male) return "NONE";
  if (female === "CHAT" && male === "CHAT") return flags.chat ? "CHAT" : "NONE";
  return "FAMILY";
}

export async function applyIntroOutcome(match: OutcomeMatch, flags: CycleFlags): Promise<IntroOutcome> {
  const prefs = await readIntroPreferences(match);
  const outcome = outcomeFor(prefs, flags);
  if (outcome === "NONE") return outcome;

  await db.$transaction(async (tx) => {
    // Idempotent: a second call finds the accepted request and does nothing
    const done = await tx.introRequest.findFirst({
      where: { matchId: match.id, type: outcome, status: "ACCEPTED" },
      select: { id: true },
    });
    if (done) return;

    const now = new Date();
    await tx.introRequest.create({
      data: {
        matchId: match.id,
        type: outcome,
        status: "ACCEPTED",
        senderId: match.femaleId,
        receiverId: match.maleId,
        respondedAt: now,
        expiresAt: now,
      },
    });

    if (outcome === "CHAT") {
      await tx.conversation.create({
        data: { matchId: match.id, expiresAt: new Date(now.getTime() + CHAT_TTL_DAYS * DAY_MS) },
      });
      return;
    }
    await tx.mutualMatch.update({
      where: { id: match.id },
      data: {
        ...(prefs.female === "FAMILY" && { femaleGuardianShareAt: now }),
        ...(prefs.male === "FAMILY" && { maleGuardianShareAt: now }),
      },
    });
  });

  return outcome;
}
