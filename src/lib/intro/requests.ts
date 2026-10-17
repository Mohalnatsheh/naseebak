/**
 * Introduction requests on a mutual match (new user cycle).
 *
 * - FAMILY: once accepted, each side sees the other family's guardian contact
 *   (only if that side consented to sharing it).
 * - CHAT: once accepted, a 14-day in-app conversation opens.
 *
 * Sending costs the sender 1 credit (never refunded) — except under credit_on_interest, where the
 * credit was spent on "مهتم" and every request is free. A declined request is final for
 * that type on that match; an expired (unanswered) one may be sent again.
 * Moving from a chat to a family introduction is free once — unless one of the two ended the
 * chat: then no family request is possible on that match any more (it is "finished").
 *
 * A block (either way) or a partner who is no longer available (deactivated / suspended) closes
 * the match: nothing can be sent or accepted, the guardian contact is withheld, and requests
 * still pending between the two are cancelled lazily (never refunded). The sender may also
 * cancel their own pending request (no refund).
 *
 * Matches opened under credit_on_interest (`openedAt` set) start with an auto-accepted outcome
 * (see outcome.ts) and use per-match guardian consent: a guardian contact is shown only for a side
 * with its share stamp (`femaleGuardianShareAt` / `maleGuardianShareAt`) AND global consent
 * (`ParentInfo.shareConsentAt`). FAMILY choosers are stamped at match creation, the other side via
 * `shareGuardianForMatch`, and both sides on accepting a later family request. Pre-flag matches keep
 * the global-consent rule.
 */
import type { IntroRequest, IntroRequestType, MatchOutcome } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { reserveCredits, notifyRequestCreditsExhausted, recordCredit } from "@/lib/credits";
import { getCycleFlags, type CycleFlags } from "@/lib/settings";
import { IntroError } from "@/lib/intro/errors";
import { applyIntroOutcome } from "@/lib/intro/outcome";
import { outcomesFor } from "@/lib/intro/followup";
import {
  LEGACY_ADMIN_VISIT,
  blockBetween,
  cancelPendingBetween,
  chatEndedByUser,
  describeMatch,
  isUnavailable,
  type MatchClosure,
} from "@/lib/matches/state";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REQUEST_TTL_DAYS = 7;
export const CHAT_TTL_DAYS = 14;

export type FamilyStatus =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "accepted"
  | "declined"
  | "legacy_admin"
  /** One of the two ended the chat: no family request on this match any more */
  | "closed";

export type ChatStatus =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "declined"
  | "open"
  | "ended"
  | "expired"
  | "disabled";

export interface GuardianContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface IntroState {
  flags: CycleFlags;
  /** credit_on_interest matches: the introduction the match opened straight into */
  outcome?: "CHAT" | "FAMILY";
  /** Set when the match is closed: I blocked them, their account is inactive, or nothing is left to do */
  closed: MatchClosure | null;
  credits: number;
  family: {
    status: FamilyStatus;
    requestId?: string;
    expiresAt?: string;
    declinedByMe?: boolean;
    /** True when the next family request is free (the match already has a chat) */
    free?: boolean;
    contacts?: GuardianContact;
  };
  chat: {
    status: ChatStatus;
    requestId?: string;
    expiresAt?: string;
    declinedByMe?: boolean;
    conversationId?: string;
  };
  /** After the family introduction: what each side told us (see intro/followup.ts) */
  followUp: {
    mine: MatchOutcome | null;
    partner: MatchOutcome | null;
    /** Show «كيف يسير التعارف؟» on the card: the families have each other's contact */
    ask: boolean;
  };
  myGuardian: {
    exists: boolean;
    consented: boolean;
    /** openedAt matches: my guardian contact is shared on this match (my share stamp is set) */
    sharedForMatch: boolean;
    /** openedAt match with an accepted family introduction and my stamp missing: ask me to share */
    askShare: boolean;
  };
}

type ShareStamps = { femaleId: string; femaleGuardianShareAt: Date | null; maleGuardianShareAt: Date | null };

/** Per-match guardian share stamp of one side. */
function shareStampOf(match: ShareStamps, userId: string): Date | null {
  return match.femaleId === userId ? match.femaleGuardianShareAt : match.maleGuardianShareAt;
}

/** The auto-accepted outcome row from applyIntroOutcome: answered at creation (respondedAt === expiresAt). */
function isOutcomeRow(r: IntroRequest): boolean {
  return r.status === "ACCEPTED" && !!r.respondedAt && r.respondedAt.getTime() === r.expiresAt.getTime();
}

async function loadMatchForUser(matchId: string, userId: string) {
  const match = await db.mutualMatch.findUnique({
    where: { id: matchId },
    include: {
      visitRequest: { select: { id: true, status: true } },
      conversation: { select: { id: true, status: true, expiresAt: true, endedById: true } },
    },
  });
  if (!match || (match.femaleId !== userId && match.maleId !== userId)) {
    throw new IntroError("NOT_FOUND", "التوافق غير موجود");
  }
  const partnerId = match.femaleId === userId ? match.maleId : match.femaleId;
  return { match, partnerId };
}

async function isBlocked(a: string, b: string): Promise<boolean> {
  const block = await db.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { id: true },
  });
  return !!block;
}

const INACTIVE_MESSAGE = "هذا الحساب غير نشط حالياً";
const CHAT_ENDED_MESSAGE = "انتهت المحادثة على هذا التوافق، لذلك لم يعد طلب التعارف العائلي متاحاً";

/** Deactivated, suspended or deleted. */
async function partnerUnavailable(partnerId: string): Promise<boolean> {
  const partner = await db.user.findUnique({ where: { id: partnerId }, select: { isDeactivated: true, status: true } });
  return isUnavailable(partner);
}

/** True when either user is suspended by an admin (one count query). */
async function eitherSuspended(a: string, b: string): Promise<boolean> {
  const n = await db.user.count({ where: { id: { in: [a, b] }, status: "SUSPENDED" } });
  return n > 0;
}

async function expireStale(matchId: string): Promise<void> {
  await db.introRequest.updateMany({
    where: { matchId, status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}

function ofType(requests: IntroRequest[], type: IntroRequestType) {
  return requests.filter((r) => r.type === type);
}

function pendingOf(requests: IntroRequest[], type: IntroRequestType) {
  return ofType(requests, type).find((r) => r.status === "PENDING" && r.expiresAt > new Date());
}

function declinedOf(requests: IntroRequest[], type: IntroRequestType) {
  return ofType(requests, type).find((r) => r.status === "DECLINED");
}

function conversationStatus(c: { status: string; expiresAt: Date }): ChatStatus {
  if (c.status === "ENDED") return "ended";
  if (c.status === "EXPIRED" || c.expiresAt < new Date()) return "expired";
  return "open";
}

export async function getMatchIntroState(matchId: string, userId: string): Promise<IntroState> {
  const loaded = await loadMatchForUser(matchId, userId);
  let { match } = loaded;
  const { partnerId } = loaded;
  // They blocked me: the match is gone for me
  const block = await blockBetween(userId, partnerId);
  if (block.byThem) throw new IntroError("NOT_FOUND", "التوافق غير موجود");
  await expireStale(matchId);

  const [flags, me, myGuardian, unavailable] = await Promise.all([
    getCycleFlags(),
    db.user.findUnique({ where: { id: userId }, select: { matchCredits: true } }),
    db.parentInfo.findUnique({ where: { userId } }),
    partnerUnavailable(partnerId),
  ]);
  const guardianBase = { exists: !!myGuardian, consented: !!myGuardian?.shareConsentAt };
  const base = { flags, credits: me?.matchCredits ?? 0 };

  // Closed by a block or an inactive partner: nothing to do, no guardian contact, pending requests cancelled
  if (block.byMe || unavailable) {
    await cancelPendingBetween(userId, partnerId);
    return {
      ...base,
      myGuardian: { ...guardianBase, sharedForMatch: false, askShare: false },
      followUp: { ...outcomesFor(match, userId), ask: false },
      closed: block.byMe ? "blocked" : "inactive",
      family: { status: "none" },
      chat: { status: "none" },
    };
  }

  const loadRequests = () => db.introRequest.findMany({ where: { matchId }, orderBy: { createdAt: "desc" } });
  let requests = await loadRequests();

  // Self-heal: an openedAt match whose outcome step failed gets it on first view (idempotent, no notification).
  // Only while the match has no intro request at all, so a pending manual request is never superseded.
  if (match.openedAt && match.suggestionId && requests.length === 0) {
    const applied = await applyIntroOutcome(match, flags).catch((e: unknown) => {
      console.error("Lazy intro outcome", e);
      return "NONE" as const;
    });
    if (applied !== "NONE") {
      match = (await loadMatchForUser(matchId, userId)).match;
      requests = await loadRequests();
    }
  }
  const openedMatch = !!match.openedAt;
  const endedByUser = chatEndedByUser(match.conversation);
  const { closed } = describeMatch({
    requests,
    conversation: match.conversation,
    visitStatus: match.visitRequest?.status ?? null,
    partnerUnavailable: false,
    blockedByMe: false,
    chatEnabled: flags.chat,
    introEnabled: flags.introRequests,
    outcomes: outcomesFor(match, userId),
  });

  // Family
  const family: IntroState["family"] = { status: "none" };
  const acceptedFamily = ofType(requests, "FAMILY").find((r) => r.status === "ACCEPTED");
  const pendingFamily = pendingOf(requests, "FAMILY");
  const declinedFamily = declinedOf(requests, "FAMILY");
  if (acceptedFamily) {
    family.status = "accepted";
    family.requestId = acceptedFamily.id;
    const partnerGuardian = await db.parentInfo.findUnique({ where: { userId: partnerId } });
    // openedAt matches also need the partner's per-match share stamp
    const partnerShares = !openedMatch || !!shareStampOf(match, partnerId);
    if (partnerGuardian?.shareConsentAt && partnerShares) {
      family.contacts = {
        name: partnerGuardian.parentName,
        relationship: partnerGuardian.relationship,
        phone: partnerGuardian.parentPhone,
      };
    }
  } else if (match.visitRequest && LEGACY_ADMIN_VISIT.includes(match.visitRequest.status)) {
    family.status = "legacy_admin";
  } else if (pendingFamily) {
    family.status = pendingFamily.senderId === userId ? "pending_sent" : "pending_received";
    family.requestId = pendingFamily.id;
    family.expiresAt = pendingFamily.expiresAt.toISOString();
  } else if (declinedFamily) {
    family.status = "declined";
    family.declinedByMe = declinedFamily.receiverId === userId;
  } else if (endedByUser) {
    family.status = "closed";
  } else {
    // Free once after a chat that expired (or was closed by an admin)
    family.free = !!match.conversation && ofType(requests, "FAMILY").length === 0;
  }

  // Chat
  const chat: IntroState["chat"] = { status: "none" };
  const pendingChat = pendingOf(requests, "CHAT");
  const declinedChat = declinedOf(requests, "CHAT");
  if (match.conversation) {
    chat.status = conversationStatus(match.conversation);
    chat.conversationId = match.conversation.id;
    chat.expiresAt = match.conversation.expiresAt.toISOString();
  } else if (pendingChat) {
    chat.status = pendingChat.senderId === userId ? "pending_sent" : "pending_received";
    chat.requestId = pendingChat.id;
    chat.expiresAt = pendingChat.expiresAt.toISOString();
  } else if (declinedChat) {
    chat.status = "declined";
    chat.declinedByMe = declinedChat.receiverId === userId;
  } else if (!flags.chat) {
    chat.status = "disabled";
  }

  const sharedForMatch = openedMatch && !!shareStampOf(match, userId);
  const outcomeType = openedMatch ? requests.findLast(isOutcomeRow)?.type : undefined;
  const outcomes = outcomesFor(match, userId);
  return {
    ...base,
    ...(outcomeType && { outcome: outcomeType }),
    // The families can talk once both contacts are out (older matches: the accepted family intro is enough)
    followUp: {
      ...outcomes,
      ask: !closed && !!acceptedFamily && (!openedMatch || (!!match.femaleGuardianShareAt && !!match.maleGuardianShareAt)),
    },
    myGuardian: { ...guardianBase, sharedForMatch, askShare: !closed && openedMatch && !!acceptedFamily && !sharedForMatch },
    closed,
    family,
    chat,
  };
}

// Serialises sends per match within this server process (PM2 fork mode = one process),
// so two quick taps can't both pass the "already pending" check and charge twice.
const sending = new Set<string>();

export async function sendIntroRequest(args: {
  matchId: string;
  senderId: string;
  type: IntroRequestType;
}): Promise<{ requestId: string; creditsLeft: number }> {
  const { matchId, senderId, type } = args;
  const flags = await getCycleFlags();
  if (!flags.introRequests) throw new IntroError("DISABLED");
  if (type === "CHAT" && !flags.chat) throw new IntroError("DISABLED");

  const lockKey = `${matchId}:${type}`;
  if (sending.has(lockKey)) throw new IntroError("DUPLICATE");
  sending.add(lockKey);
  try {
    const { match, partnerId } = await loadMatchForUser(matchId, senderId);
    if (await isBlocked(senderId, partnerId)) {
      await cancelPendingBetween(senderId, partnerId);
      throw new IntroError("BLOCKED");
    }
    if ((await partnerUnavailable(partnerId)) || (await eitherSuspended(senderId, partnerId))) {
      await cancelPendingBetween(senderId, partnerId);
      throw new IntroError("NOT_ALLOWED", INACTIVE_MESSAGE);
    }
    await expireStale(matchId);

    const requests = await db.introRequest.findMany({ where: { matchId }, orderBy: { createdAt: "desc" } });
    if (pendingOf(requests, type)) throw new IntroError("DUPLICATE");
    if (declinedOf(requests, type)) throw new IntroError("NOT_ALLOWED", "تم رفض هذا الطلب سابقاً");

    let free = false;
    if (type === "FAMILY") {
      if (ofType(requests, "FAMILY").some((r) => r.status === "ACCEPTED")) throw new IntroError("NOT_ALLOWED");
      if (match.visitRequest && LEGACY_ADMIN_VISIT.includes(match.visitRequest.status)) {
        throw new IntroError("NOT_ALLOWED", "فريق نصيبك يتابع ترتيب الزيارة لهذا التوافق");
      }
      if (chatEndedByUser(match.conversation)) throw new IntroError("NOT_ALLOWED", CHAT_ENDED_MESSAGE);
      const guardian = await db.parentInfo.findUnique({ where: { userId: senderId } });
      if (!guardian) throw new IntroError("GUARDIAN_REQUIRED");
      if (!guardian.shareConsentAt) throw new IntroError("CONSENT_REQUIRED");
      free = !!match.conversation && ofType(requests, "FAMILY").length === 0;
    } else if (match.conversation) {
      throw new IntroError("NOT_ALLOWED", "المحادثة مفتوحة أو انتهت لهذا التوافق");
    }

    // credit_on_interest: the credit was spent on "مهتم" — every request is free
    const charge = !free && !flags.creditOnInterest;

    // Charge and create together: a failed create never costs a credit
    const request = await db.$transaction(async (tx) => {
      if (charge && !(await reserveCredits(senderId, 1, tx))) throw new IntroError("NO_CREDITS");
      return tx.introRequest.create({
        data: {
          matchId,
          type,
          senderId,
          receiverId: partnerId,
          expiresAt: new Date(Date.now() + REQUEST_TTL_DAYS * DAY_MS),
        },
      });
    });

    if (charge) await recordCredit({ userId: senderId, delta: -1, reason: "REQUEST", refId: request.id });

    const sender = await db.user.findUnique({
      where: { id: senderId },
      select: { matchCredits: true, firstName: true },
    });
    const name = sender?.firstName ?? "";
    await notify({
      userId: partnerId,
      type: "INTRO_REQUEST",
      title: type === "FAMILY" ? "طلب تعارف عائلي جديد" : "طلب محادثة جديد",
      body:
        type === "FAMILY"
          ? `وصلك طلب تعارف عائلي من ${name}. عند القبول تتبادل العائلتان بيانات التواصل.`
          : `وصلك طلب محادثة من ${name} للتعارف قبل الزيارة العائلية.`,
      url: `/dashboard/matches?match=${matchId}`,
      metadata: { matchId, requestId: request.id },
    });

    const creditsLeft = sender?.matchCredits ?? 0;
    if (charge && creditsLeft <= 0) await notifyRequestCreditsExhausted(senderId);
    return { requestId: request.id, creditsLeft };
  } finally {
    sending.delete(lockKey);
  }
}

export async function respondToIntroRequest(args: {
  requestId: string;
  userId: string;
  accept: boolean;
  consent?: boolean;
}): Promise<{ status: "ACCEPTED" | "DECLINED"; conversationId?: string }> {
  const { requestId, userId, accept, consent } = args;
  const request = await db.introRequest.findUnique({
    where: { id: requestId },
    include: {
      match: {
        include: {
          visitRequest: { select: { id: true, status: true } },
          conversation: { select: { id: true, status: true, expiresAt: true, endedById: true } },
        },
      },
    },
  });
  if (!request || request.receiverId !== userId) throw new IntroError("NOT_FOUND", "الطلب غير موجود");
  if (request.status !== "PENDING") throw new IntroError("NOT_ALLOWED", "تم الرد على هذا الطلب مسبقاً");
  if (request.expiresAt < new Date()) {
    await db.introRequest.update({ where: { id: requestId }, data: { status: "EXPIRED" } });
    throw new IntroError("EXPIRED");
  }
  if (await isBlocked(request.senderId, userId)) {
    // The match is closed: the request goes away quietly (no refund)
    await cancelPendingBetween(request.senderId, userId);
    throw new IntroError("BLOCKED");
  }
  if ((await partnerUnavailable(request.senderId)) || (accept && (await eitherSuspended(request.senderId, userId)))) {
    await cancelPendingBetween(request.senderId, userId);
    throw new IntroError("NOT_ALLOWED", INACTIVE_MESSAGE);
  }
  if (accept && request.type === "FAMILY" && chatEndedByUser(request.match.conversation)) {
    await db.introRequest.updateMany({ where: { id: requestId, status: "PENDING" }, data: { status: "CANCELLED" } });
    throw new IntroError("NOT_ALLOWED", CHAT_ENDED_MESSAGE);
  }

  const matchUrl = `/dashboard/matches?match=${request.matchId}`;

  if (!accept) {
    const claimed = await db.introRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    if (claimed.count !== 1) throw new IntroError("NOT_ALLOWED", "تم الرد على هذا الطلب مسبقاً");
    await notify({
      userId: request.senderId,
      type: "INTRO_REQUEST",
      title: "لم يتم قبول الطلب حالياً",
      body:
        request.type === "FAMILY"
          ? "لم يتم قبول طلب التعارف العائلي. نتمنى لك التوفيق في اقتراحاتك القادمة."
          : "لم يتم قبول طلب المحادثة. نتمنى لك التوفيق في اقتراحاتك القادمة.",
      url: matchUrl,
      metadata: { matchId: request.matchId, requestId },
    });
    return { status: "DECLINED" };
  }

  // Check everything before claiming the request
  let recordConsent = false;
  if (request.type === "FAMILY") {
    const [guardian, senderGuardian] = await Promise.all([
      db.parentInfo.findUnique({ where: { userId } }),
      db.parentInfo.findUnique({ where: { userId: request.senderId } }),
    ]);
    if (!guardian) throw new IntroError("GUARDIAN_REQUIRED");
    if (!guardian.shareConsentAt) {
      if (!consent) throw new IntroError("CONSENT_REQUIRED");
      recordConsent = true;
    }
    // Both families must be sharing at the moment of acceptance
    if (!senderGuardian?.shareConsentAt) {
      throw new IntroError("NOT_ALLOWED", "لا يمكن إتمام التعارف العائلي حالياً لأن الطرف الآخر لم يعد يشارك بيانات وليّ الأمر");
    }
  } else {
    if (!(await getCycleFlags()).chat) throw new IntroError("DISABLED", "المحادثات متوقفة حالياً، حاول لاحقاً");
    if (request.match.conversation) throw new IntroError("NOT_ALLOWED");
  }

  // Claim + side effects in one transaction: a double tap or accept/decline race can only win once
  const conversationId = await db.$transaction(async (tx) => {
    const claimed = await tx.introRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    if (claimed.count !== 1) throw new IntroError("NOT_ALLOWED", "تم الرد على هذا الطلب مسبقاً");

    if (request.type === "FAMILY") {
      if (recordConsent) await tx.parentInfo.update({ where: { userId }, data: { shareConsentAt: new Date() } });
      // openedAt match: both sides consented (sender to send, receiver to accept) → share on this match
      const m = request.match;
      if (m.openedAt && (!m.femaleGuardianShareAt || !m.maleGuardianShareAt)) {
        const now = new Date();
        await tx.mutualMatch.update({
          where: { id: m.id },
          data: {
            ...(!m.femaleGuardianShareAt && { femaleGuardianShareAt: now }),
            ...(!m.maleGuardianShareAt && { maleGuardianShareAt: now }),
          },
        });
      }
      const visit = request.match.visitRequest;
      if (visit && visit.status === "REQUESTED") {
        await tx.visitRequest.update({
          where: { id: visit.id },
          data: { status: "CANCELLED", adminNotes: "Closed: families connected via family introduction" },
        });
      }
      return undefined;
    }
    const conversation = await tx.conversation.create({
      data: { matchId: request.matchId, expiresAt: new Date(Date.now() + CHAT_TTL_DAYS * DAY_MS) },
    });
    return conversation.id;
  });

  await notify({
    userId: request.senderId,
    type: "INTRO_REQUEST",
    title: "تم قبول طلبك",
    body:
      request.type === "FAMILY"
        ? "تم قبول طلب التعارف العائلي. يمكنك الآن رؤية بيانات وليّ الأمر للطرف الآخر."
        : "تم قبول طلب المحادثة. يمكنكما الآن التعارف داخل نصيبك لمدة 14 يوماً.",
    url: conversationId ? `/dashboard/chats/${conversationId}` : matchUrl,
    metadata: { matchId: request.matchId, requestId },
  });

  return { status: "ACCEPTED", conversationId };
}

/**
 * The sender withdraws their own pending request. The credit is not refunded (product rule).
 * Nobody is notified; the receiver's unread notification for it is marked read so the badge goes.
 */
export async function cancelIntroRequest(args: { requestId: string; userId: string }): Promise<{ status: "CANCELLED" }> {
  const { requestId, userId } = args;
  const request = await db.introRequest.findUnique({ where: { id: requestId } });
  if (!request || request.senderId !== userId) throw new IntroError("NOT_FOUND", "الطلب غير موجود");
  if (request.status !== "PENDING") throw new IntroError("NOT_ALLOWED", "لم يعد هذا الطلب قيد الانتظار");
  if (request.expiresAt < new Date()) {
    await db.introRequest.update({ where: { id: requestId }, data: { status: "EXPIRED" } });
    throw new IntroError("EXPIRED");
  }
  const claimed = await db.introRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (claimed.count !== 1) throw new IntroError("NOT_ALLOWED", "لم يعد هذا الطلب قيد الانتظار");

  await db.notification
    .updateMany({
      where: {
        userId: request.receiverId,
        type: "INTRO_REQUEST",
        isRead: false,
        metadata: { path: ["requestId"], equals: requestId },
      },
      data: { isRead: true },
    })
    .catch((e: unknown) => console.error("Cancel intro: clear notification", e));
  // The receiver may have seen it already: say it was withdrawn instead of letting it vanish
  try {
    await notify({
      userId: request.receiverId,
      type: "INTRO_REQUEST",
      title: request.type === "FAMILY" ? "أُلغي طلب التعارف العائلي" : "أُلغي طلب المحادثة",
      body: "سحب الطرف الآخر طلبه قبل الرد عليه. ما زال التوافق قائماً ويمكنكما إرسال طلب جديد لاحقاً.",
      url: `/dashboard/matches?match=${request.matchId}`,
      metadata: { matchId: request.matchId },
    });
  } catch (e) {
    console.error("Cancel intro: notify receiver", e);
  }
  return { status: "CANCELLED" };
}

/**
 * Share my guardian contact on one credit_on_interest match (openedAt set): stamps my side only.
 * Needs my guardian and global consent — `consent: true` records the global consent here.
 */
export async function shareGuardianForMatch(args: {
  matchId: string;
  userId: string;
  consent?: boolean;
}): Promise<IntroState> {
  const { matchId, userId, consent } = args;
  const { match, partnerId } = await loadMatchForUser(matchId, userId);
  const block = await blockBetween(userId, partnerId);
  if (block.byThem) throw new IntroError("NOT_FOUND", "التوافق غير موجود");
  if (block.byMe) throw new IntroError("BLOCKED");
  if (await partnerUnavailable(partnerId)) throw new IntroError("NOT_ALLOWED", INACTIVE_MESSAGE);
  if (!match.openedAt) throw new IntroError("NOT_ALLOWED");

  const guardian = await db.parentInfo.findUnique({ where: { userId } });
  if (!guardian) throw new IntroError("GUARDIAN_REQUIRED");
  if (!guardian.shareConsentAt) {
    if (!consent) throw new IntroError("CONSENT_REQUIRED");
    await db.parentInfo.update({ where: { userId }, data: { shareConsentAt: new Date() } });
  }

  const field = match.femaleId === userId ? "femaleGuardianShareAt" : "maleGuardianShareAt";
  // Conditional: a repeat keeps the first stamp
  const stamped = await db.mutualMatch.updateMany({ where: { id: matchId, [field]: null }, data: { [field]: new Date() } });
  if (stamped.count === 1) {
    // The side that chose family has been waiting for this
    await notify({
      userId: partnerId,
      type: "MATCH",
      title: "تمت مشاركة بيانات وليّ الأمر",
      body: "شارك الطرف الآخر بيانات وليّ أمره. يمكنكما الآن ترتيب الزيارة العائلية.",
      url: `/dashboard/matches?match=${matchId}`,
    });
  }
  return getMatchIntroState(matchId, userId);
}

/** Consent to share the guardian contact after an accepted family introduction. */
export async function setGuardianConsent(userId: string): Promise<void> {
  const guardian = await db.parentInfo.findUnique({ where: { userId } });
  if (!guardian) throw new IntroError("GUARDIAN_REQUIRED");
  if (!guardian.shareConsentAt) {
    await db.parentInfo.update({ where: { userId }, data: { shareConsentAt: new Date() } });
  }
}
