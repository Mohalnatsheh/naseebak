/**
 * Create a mutual match and tell both users.
 * Legacy mode: also opens an admin-handled VisitRequest.
 * New cycle (`intro_requests_enabled`): no admin visit — the match card offers
 * family / chat requests instead.
 * Credit on interest (`credit_on_interest`): the match is free and opens straight into the
 * introduction both chose on "مهتم" (see `applyIntroOutcome`); without a choice (legacy rows)
 * the card shows the (free) request buttons.
 */
import { db } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notify";
import { getCycleFlags, type CycleFlags } from "@/lib/settings";
import { applyIntroOutcome, readIntroPreferences } from "@/lib/intro/outcome";

const MATCH_TITLE = "توافق متبادل!";
const REQUESTS_BODY = "تهانينا! لديك توافق متبادل جديد. يمكنك الآن إرسال طلب تعارف عائلي أو طلب محادثة.";
const CHAT_OPEN_BODY = "توافق متبادل! المحادثة مفتوحة الآن";
const FAMILY_SHARED_BODY = "توافق متبادل! تم مشاركة بيانات التواصل العائلي";
/**
 * Mixed choice, to the side that chose chat: neither guardian contact shows until this side shares too
 * (see getMatchIntroState)
 */
const OTHER_PREFERRED_FAMILY = "توافق متبادل! الطرف الآخر فضّل التعارف العائلي. شارك بيانات وليّ أمرك من صفحة التوافق لتتبادل العائلتان بيانات التواصل";
/** Mixed choice, to the side that chose family: nothing to see until the other side shares */
const WAITING_FOR_SHARE = "توافق متبادل! فضّل الطرف الآخر المحادثة أولاً، وطلبنا منه مشاركة بيانات وليّ أمره. سنُعلمك فور مشاركتها";

export async function createMutualMatch(args: {
  femaleId: string;
  maleId: string;
  suggestionId: string | null;
}): Promise<{ matchId: string }> {
  const { femaleId, maleId, suggestionId } = args;

  // A pair can only match once (unique femaleId+maleId)
  const existing = await db.mutualMatch.findUnique({
    where: { femaleId_maleId: { femaleId, maleId } },
    select: { id: true },
  });
  if (existing) return { matchId: existing.id };

  const flags = await getCycleFlags();
  if (flags.creditOnInterest) return openMatch({ femaleId, maleId, suggestionId }, flags);

  const match = await db.mutualMatch.create({
    data: { femaleId, maleId, suggestionId, revealedByFemale: false },
  });

  const { introRequests } = flags;
  if (!introRequests) {
    await db.visitRequest.create({ data: { matchId: match.id } });
  }

  await notifyMany([femaleId, maleId], {
    type: "MATCH",
    title: MATCH_TITLE,
    body: introRequests ? REQUESTS_BODY : "تهانينا! لديك توافق متبادل جديد. يمكنك الآن رؤية التفاصيل.",
    url: `/dashboard/matches?match=${match.id}`,
    metadata: { matchId: match.id },
  });

  return { matchId: match.id };
}

/** credit_on_interest: free match that opens straight into the chosen introduction; one notification each. */
async function openMatch(
  args: { femaleId: string; maleId: string; suggestionId: string | null },
  flags: CycleFlags,
): Promise<{ matchId: string }> {
  const { femaleId, maleId, suggestionId } = args;
  const match = await db.mutualMatch.create({
    data: { femaleId, maleId, suggestionId, revealedByFemale: false, openedAt: new Date() },
  });
  const ref = { id: match.id, femaleId, maleId, suggestionId };
  // The pair was already charged on "مهتم": an outcome failure must not lose the match. Log it and
  // send the plain match notice; getMatchIntroState applies the outcome lazily on first view.
  const outcome = await applyIntroOutcome(ref, flags).catch((e: unknown) => {
    console.error("[match] intro outcome failed", { matchId: match.id }, e);
    return "NONE" as const;
  });

  const matchUrl = `/dashboard/matches?match=${match.id}`;
  const metadata = { matchId: match.id };
  const base = { type: "MATCH" as const, title: MATCH_TITLE, metadata };

  if (outcome === "CHAT") {
    const conversation = await db.conversation.findUnique({ where: { matchId: match.id }, select: { id: true } });
    await notifyMany([femaleId, maleId], {
      ...base,
      body: CHAT_OPEN_BODY,
      url: conversation ? `/dashboard/chats/${conversation.id}` : matchUrl,
      metadata: { ...metadata, conversationId: conversation?.id },
    });
  } else if (outcome === "FAMILY") {
    // Mixed choice: the side that chose CHAT is told the other preferred a family introduction
    const prefs = await readIntroPreferences(ref);
    await Promise.all(
      [
        { userId: femaleId, pref: prefs.female },
        { userId: maleId, pref: prefs.male },
      ].map(({ userId, pref }) =>
        notify({
          ...base,
          userId,
          body:
            pref === "CHAT"
              ? OTHER_PREFERRED_FAMILY
              : prefs.female === "CHAT" || prefs.male === "CHAT"
                ? WAITING_FOR_SHARE
                : FAMILY_SHARED_BODY,
          url: matchUrl,
        }),
      ),
    );
  } else {
    await notifyMany([femaleId, maleId], { ...base, body: REQUESTS_BODY, url: matchUrl });
  }

  return { matchId: match.id };
}
