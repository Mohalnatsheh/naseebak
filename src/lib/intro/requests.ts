/**
 * Introduction requests on a mutual match (new user cycle).
 *
 * - FAMILY: once accepted, each side sees the other family's guardian contact
 *   (only if that side consented to sharing it).
 * - CHAT: once accepted, a 14-day in-app conversation opens.
 *
 * Sending costs the sender 1 credit (never refunded). A declined request is final for
 * that type on that match; an expired (unanswered) one may be sent again.
 * Moving from a chat to a family introduction is free once.
 */
import type { IntroRequest, IntroRequestType } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { reserveCredits, notifyRequestCreditsExhausted, recordCredit } from "@/lib/credits";
import { getCycleFlags, type CycleFlags } from "@/lib/settings";
import { IntroError } from "@/lib/intro/errors";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REQUEST_TTL_DAYS = 7;
export const CHAT_TTL_DAYS = 14;

/** Admin is already arranging (or arranged) the visit the old way */
const LEGACY_ADMIN_VISIT = ["FAMILIES_CONTACTED", "SCHEDULED", "COMPLETED"];

export type FamilyStatus =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "accepted"
  | "declined"
  | "legacy_admin";

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
  myGuardian: { exists: boolean; consented: boolean };
}

async function loadMatchForUser(matchId: string, userId: string) {
  const match = await db.mutualMatch.findUnique({
    where: { id: matchId },
    include: {
      visitRequest: { select: { id: true, status: true } },
      conversation: { select: { id: true, status: true, expiresAt: true } },
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
  const { match, partnerId } = await loadMatchForUser(matchId, userId);
  await expireStale(matchId);

  const [flags, requests, me, myGuardian] = await Promise.all([
    getCycleFlags(),
    db.introRequest.findMany({ where: { matchId }, orderBy: { createdAt: "desc" } }),
    db.user.findUnique({ where: { id: userId }, select: { matchCredits: true } }),
    db.parentInfo.findUnique({ where: { userId } }),
  ]);

  // Family
  const family: IntroState["family"] = { status: "none" };
  const acceptedFamily = ofType(requests, "FAMILY").find((r) => r.status === "ACCEPTED");
  const pendingFamily = pendingOf(requests, "FAMILY");
  const declinedFamily = declinedOf(requests, "FAMILY");
  if (acceptedFamily) {
    family.status = "accepted";
    family.requestId = acceptedFamily.id;
    const partnerGuardian = await db.parentInfo.findUnique({ where: { userId: partnerId } });
    if (partnerGuardian?.shareConsentAt) {
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
  } else {
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

  return {
    flags,
    credits: me?.matchCredits ?? 0,
    family,
    chat,
    myGuardian: { exists: !!myGuardian, consented: !!myGuardian?.shareConsentAt },
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
    if (await isBlocked(senderId, partnerId)) throw new IntroError("BLOCKED");
    const partner = await db.user.findUnique({ where: { id: partnerId }, select: { isDeactivated: true } });
    if (partner?.isDeactivated) throw new IntroError("NOT_ALLOWED", INACTIVE_MESSAGE);
    if (await eitherSuspended(senderId, partnerId)) throw new IntroError("NOT_ALLOWED", INACTIVE_MESSAGE);
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
      const guardian = await db.parentInfo.findUnique({ where: { userId: senderId } });
      if (!guardian) throw new IntroError("GUARDIAN_REQUIRED");
      if (!guardian.shareConsentAt) throw new IntroError("CONSENT_REQUIRED");
      free = !!match.conversation && ofType(requests, "FAMILY").length === 0;
    } else if (match.conversation) {
      throw new IntroError("NOT_ALLOWED", "المحادثة مفتوحة أو انتهت لهذا التوافق");
    }

    // Charge and create together: a failed create never costs a credit
    const request = await db.$transaction(async (tx) => {
      if (!free && !(await reserveCredits(senderId, 1, tx))) throw new IntroError("NO_CREDITS");
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

    if (!free) await recordCredit({ userId: senderId, delta: -1, reason: "REQUEST", refId: request.id });

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
    if (!free && creditsLeft <= 0) await notifyRequestCreditsExhausted(senderId);
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
          conversation: { select: { id: true, status: true, expiresAt: true } },
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
  if (accept && (await isBlocked(request.senderId, userId))) throw new IntroError("BLOCKED");
  if (accept && (await eitherSuspended(request.senderId, userId))) {
    throw new IntroError("NOT_ALLOWED", INACTIVE_MESSAGE);
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
        : "تم قبول طلب المحادثة. يمكنكما الآن التعارف داخل نصيبك لمدة ١٤ يوماً.",
    url: conversationId ? `/dashboard/chats/${conversationId}` : matchUrl,
    metadata: { matchId: request.matchId, requestId },
  });

  return { status: "ACCEPTED", conversationId };
}

/** Consent to share the guardian contact after an accepted family introduction. */
export async function setGuardianConsent(userId: string): Promise<void> {
  const guardian = await db.parentInfo.findUnique({ where: { userId } });
  if (!guardian) throw new IntroError("GUARDIAN_REQUIRED");
  if (!guardian.shareConsentAt) {
    await db.parentInfo.update({ where: { userId }, data: { shareConsentAt: new Date() } });
  }
}
