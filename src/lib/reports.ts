/**
 * One way to file a report, used by the match card (POST /api/reports) and by «إنهاء وإبلاغ» in a
 * chat: a repeat report about the same person reopens the earlier one and keeps both accounts of what
 * happened, and every report counts toward the automatic flag (3+ different people).
 *
 * - Every report is emailed to the admin inbox (best effort, `sendAdminAlert`).
 * - While 3+ different people have a PENDING report about a member, that member is "paused for review":
 *   their open chats are paused (ENDED with `endedByAdminId = REPORT_PAUSE_MARKER`, so nobody can write)
 *   and intro requests / guardian sharing involving them are refused (src/lib/intro/requests.ts).
 *   Once an admin has reviewed enough of them (fewer than 3 still pending), `refreshReportFlag` resumes
 *   the paused chats (the paused days are added back to their clock).
 * - The flag (`isFlagged`, no new suggestions) follows PENDING + REVIEWED reports and is cleared again
 *   when dismissals bring an auto-flagged member under 3.
 */
import { Prisma, type ReportReason } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { CHAT_NOTICE_PREFERENCE } from "@/lib/notification-prefs";
import { publishChatEvent } from "@/lib/ably";
import { sendAdminAlert } from "@/lib/admin-alert";
import { isUnavailable, loadEngagements } from "@/lib/matches/state";

/** Reports from this many different people flag an account (no new suggestions, admin attention) */
export const AUTO_FLAG_REPORTS = 3;
/** Stored details are capped so a long run of repeat reports can't grow without limit */
const MAX_STORED_DETAILS = 5000;
/** `Conversation.endedByAdminId` of a chat paused while its member's reports are reviewed (not an admin id) */
export const REPORT_PAUSE_MARKER = "system:report-review";
/** `endedByAdminId` of a paused chat that ended for good because its match closed while it was paused */
export const PAUSED_MATCH_CLOSED_MARKER = "system:match-closed";
const AUTO_FLAG_PREFIX = "Auto-flagged";

const REASON_LABEL: Record<ReportReason, string> = {
  FAKE_PROFILE: "حساب مزيف",
  INAPPROPRIATE_CONTENT: "محتوى غير لائق",
  HARASSMENT: "إزعاج أو تحرش",
  SPAM: "رسائل مزعجة",
  OTHER: "سبب آخر",
};

export interface FileReportInput {
  reporterId: string;
  reportedId: string;
  reason: ReportReason;
  details?: string | null;
  /** The chat it was sent from, when there is one */
  conversationId?: string | null;
}

export async function fileReport(input: FileReportInput): Promise<{ id: string; reopened: boolean; flagged: boolean }> {
  const { reporterId, reportedId, reason, conversationId } = input;
  const details = input.details?.trim() || null;

  const existing = await db.report.findUnique({
    where: { reporterId_reportedId: { reporterId, reportedId } },
    select: { id: true, details: true, status: true },
  });

  let id: string;
  if (existing) {
    // A new incident: keep what was said before and add the new account under it
    const stamp = new Date().toISOString().slice(0, 10);
    const merged = [existing.details, details && `[${stamp}] ${details}`].filter(Boolean).join("\n---\n") || null;
    const report = await db.report.update({
      where: { id: existing.id },
      data: {
        reason,
        details: merged ? merged.slice(-MAX_STORED_DETAILS) : null,
        status: "PENDING",
        reviewedAt: null,
        ...(conversationId && { conversationId }),
      },
      select: { id: true },
    });
    id = report.id;
  } else {
    const report = await db.report.create({
      data: { reporterId, reportedId, reason, details, ...(conversationId && { conversationId }) },
      select: { id: true },
    });
    id = report.id;
  }

  const flagged = await recountFlag(reportedId);
  // This report just became pending (new, or reopened after a review): may start the pause
  const newlyPending = existing?.status !== "PENDING";
  const pending = await pendingReportCount(reportedId);
  const pausedNow = newlyPending && pending === AUTO_FLAG_REPORTS ? await pauseChatsFor(reportedId) : 0;

  void alertAdmins({ id, reporterId, reportedId, reason, details, reopened: !!existing, pending, pausedNow, fromChat: !!conversationId });
  return { id, reopened: !!existing, flagged };
}

async function alertAdmins(r: {
  id: string; reporterId: string; reportedId: string; reason: ReportReason; details: string | null;
  reopened: boolean; pending: number; pausedNow: number; fromChat: boolean;
}): Promise<void> {
  try {
    const people = await db.user.findMany({
      where: { id: { in: [r.reporterId, r.reportedId] } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const who = (id: string) => {
      const p = people.find((x) => x.id === id);
      return p ? `${p.firstName} ${p.lastName} (+${p.phone}, ${id})` : id;
    };
    const lines = [
      r.reopened ? "بلاغ متكرر (أُعيد فتح البلاغ السابق)" : "بلاغ جديد",
      `المُبلِّغ: ${who(r.reporterId)}`,
      `المُبلَّغ عنه: ${who(r.reportedId)}`,
      `السبب: ${REASON_LABEL[r.reason] ?? r.reason}${r.fromChat ? " · من المحادثة" : ""}`,
      r.details ? `التفاصيل: ${r.details}` : null,
      `بلاغات قيد المراجعة عن هذا العضو: ${r.pending}`,
      r.pending >= AUTO_FLAG_REPORTS
        ? `تم إيقاف محادثاته مؤقتاً${r.pausedNow ? ` (${r.pausedNow})` : ""} وطلباته حتى تتم مراجعة البلاغات.`
        : null,
      `Admin → Reports (report ${r.id})`,
    ].filter(Boolean);
    const subject = r.pending >= AUTO_FLAG_REPORTS ? "بلاغ جديد — العضو موقوف مؤقتاً للمراجعة" : "بلاغ جديد";
    await sendAdminAlert(subject, lines.join("\n"));
  } catch (error) {
    console.error("[reports] admin alert", error);
  }
}

/** Reports about this member that no admin has looked at yet (one per reporter). */
async function pendingReportCount(reportedId: string): Promise<number> {
  return db.report.count({ where: { reportedId, status: "PENDING" } });
}

/** Members (of `userIds`) whose chats and requests are paused until an admin reviews their reports. */
export async function pausedForReview(userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const id of new Set(userIds)) {
    if ((await pendingReportCount(id)) >= AUTO_FLAG_REPORTS) out.add(id);
  }
  return out;
}

/** Was this chat paused for a report review (rather than ended)? */
export function isPausedForReview(c: { status: string; endedByAdminId?: string | null } | null | undefined): boolean {
  return !!c && c.status === "ENDED" && c.endedByAdminId === REPORT_PAUSE_MARKER;
}

const PAUSED_BODY = "أوقفنا هذه المحادثة مؤقتاً لمراجعة من فريق نصيبك. سنُعلمك عند استئنافها.";

/** Tell both people in a chat (best effort). */
async function tellBoth(c: { id: string; match: { femaleId: string; maleId: string } }, title: string, body: string): Promise<void> {
  for (const userId of [c.match.femaleId, c.match.maleId]) {
    try {
      await notify({ userId, type: "CHAT", title, body, url: `/dashboard/chats/${c.id}`, metadata: { conversationId: c.id }, preference: CHAT_NOTICE_PREFERENCE });
    } catch (e) {
      console.error("[reports] chat notice", e);
    }
  }
}

/** Pause the member's open chats (both sides are told). Returns how many were paused. */
async function pauseChatsFor(userId: string): Promise<number> {
  const now = new Date();
  const chats = await db.conversation.findMany({
    where: { status: "ACTIVE", match: { OR: [{ femaleId: userId }, { maleId: userId }] } },
    select: { id: true, match: { select: { femaleId: true, maleId: true } } },
  });
  let paused = 0;
  for (const c of chats) {
    const { count } = await db.conversation.updateMany({
      where: { id: c.id, status: "ACTIVE" },
      data: { status: "ENDED", endedAt: now, endedByAdminId: REPORT_PAUSE_MARKER },
    });
    if (count !== 1) continue;
    paused++;
    await publishChatEvent(c.id, "status", { status: "ENDED" }).catch(() => {});
    await tellBoth(c, "المحادثة متوقفة مؤقتاً", PAUSED_BODY);
  }
  return paused;
}

/**
 * A paused chat whose match closed in the meantime ends for good instead (the pause marker is replaced,
 * so a later review never reopens it). Used by the closers: block, «لم يحصل نصيب», «تمت الخطبة» on
 * another match, leaving. `ender` is what an ACTIVE chat closed the same way would get.
 */
export async function endPausedChats(
  match: Prisma.MutualMatchWhereInput,
  ender: { endedById?: string; endedByAdminId?: string },
): Promise<number> {
  const { count } = await db.conversation.updateMany({
    where: { status: "ENDED", endedByAdminId: REPORT_PAUSE_MARKER, match },
    data: { endedById: ender.endedById ?? null, endedByAdminId: ender.endedByAdminId ?? null },
  });
  return count;
}

/**
 * Resume the member's paused chats once they are no longer under review (and neither is the partner).
 * A chat whose match died while it was paused (a block between the two, «لم يحصل نصيب» / «تمت الخطبة»
 * on it, either side engaged on another match, or a partner who left / was suspended) is not resumed:
 * it ends for good (PAUSED_MATCH_CLOSED_MARKER).
 */
async function resumeChatsFor(userId: string): Promise<number> {
  const now = new Date();
  const person = { select: { isDeactivated: true, status: true } };
  const chats = await db.conversation.findMany({
    where: { status: "ENDED", endedByAdminId: REPORT_PAUSE_MARKER, match: { OR: [{ femaleId: userId }, { maleId: userId }] } },
    select: {
      id: true, expiresAt: true, endedAt: true,
      match: {
        select: {
          id: true, femaleId: true, maleId: true, femaleOutcome: true, maleOutcome: true,
          female: person, male: person,
        },
      },
    },
  });
  let resumed = 0;
  for (const c of chats) {
    const partner = c.match.femaleId === userId ? c.match.maleId : c.match.femaleId;
    if ((await pausedForReview([partner])).size > 0) continue;
    if (await matchClosedForChat(c.match)) {
      await db.conversation.updateMany({
        where: { id: c.id, status: "ENDED", endedByAdminId: REPORT_PAUSE_MARKER },
        data: { endedByAdminId: PAUSED_MATCH_CLOSED_MARKER },
      });
      continue;
    }
    // The days spent paused are given back
    const pausedMs = c.endedAt ? Math.max(0, now.getTime() - c.endedAt.getTime()) : 0;
    const { count } = await db.conversation.updateMany({
      where: { id: c.id, status: "ENDED", endedByAdminId: REPORT_PAUSE_MARKER },
      data: { status: "ACTIVE", endedAt: null, endedByAdminId: null, expiresAt: new Date(c.expiresAt.getTime() + pausedMs) },
    });
    if (count !== 1) continue;
    resumed++;
    await tellBoth(c, "استُؤنفت المحادثة", "انتهت المراجعة ويمكنكما متابعة المحادثة.");
  }
  return resumed;
}

/** Did the match behind a paused chat close while it was paused? */
async function matchClosedForChat(m: {
  id: string; femaleId: string; maleId: string; femaleOutcome: string | null; maleOutcome: string | null;
  female: { isDeactivated: boolean; status: string } | null; male: { isDeactivated: boolean; status: string } | null;
}): Promise<boolean> {
  const outcomes = [m.femaleOutcome, m.maleOutcome];
  if (outcomes.includes("NOT_A_MATCH") || outcomes.includes("ENGAGED")) return true;
  if (isUnavailable(m.female) || isUnavailable(m.male)) return true;
  const block = await db.block.findFirst({
    where: {
      OR: [
        { blockerId: m.femaleId, blockedId: m.maleId },
        { blockerId: m.maleId, blockedId: m.femaleId },
      ],
    },
    select: { id: true },
  });
  if (block) return true;
  const engagements = await loadEngagements([m.femaleId, m.maleId]);
  return engagements.elsewhere(m.femaleId, m.id) || engagements.elsewhere(m.maleId, m.id);
}

/**
 * An admin ends a chat that was paused for review: it stays ended for good (no resume later).
 * Returns true when the chat was a paused one.
 */
export async function endPausedChat(conversationId: string, adminId: string): Promise<boolean> {
  const { count } = await db.conversation.updateMany({
    where: { id: conversationId, status: "ENDED", endedByAdminId: REPORT_PAUSE_MARKER },
    data: { endedByAdminId: adminId },
  });
  return count === 1;
}

/** Flag the account once reports from enough different people are open or upheld. */
async function recountFlag(reportedId: string): Promise<boolean> {
  const count = await db.report.count({ where: { reportedId, status: { in: ["PENDING", "REVIEWED"] } } });
  if (count < AUTO_FLAG_REPORTS) return false;
  await db.user.updateMany({
    where: { id: reportedId, isFlagged: false },
    data: { isFlagged: true, flagReason: `${AUTO_FLAG_PREFIX}: ${count} reports from different users` },
  });
  return true;
}

/**
 * After an admin reviews a report: recount the flag (an automatic flag is cleared when dismissals
 * bring the member under 3; a flag set by hand stays) and resume paused chats once fewer than 3
 * reports are still waiting.
 */
export async function refreshReportFlag(reportedId: string): Promise<{ flagged: boolean; resumed: number }> {
  const flagged = await recountFlag(reportedId);
  if (!flagged) {
    await db.user.updateMany({
      where: { id: reportedId, isFlagged: true, flagReason: { startsWith: AUTO_FLAG_PREFIX } },
      data: { isFlagged: false, flagReason: null },
    });
  }
  const resumed = (await pendingReportCount(reportedId)) < AUTO_FLAG_REPORTS ? await resumeChatsFor(reportedId) : 0;
  return { flagged, resumed };
}

/** Messages kept per reported chat (the latest ones, if there are more) */
const EVIDENCE_MAX_MESSAGES = 1000;

/**
 * Before an account is deleted: save, on every report it is part of, who the two people were and the
 * chat between them. The match, chat and messages are deleted with the account, and the report's link
 * to that account becomes null, so this snapshot is what admins still see. A report that already has
 * a snapshot (the other account was deleted first) keeps it.
 */
export async function snapshotReportEvidence(userId: string): Promise<number> {
  const reports = await db.report.findMany({
    where: { OR: [{ reporterId: userId }, { reportedId: userId }], evidence: { equals: Prisma.DbNull } },
    select: { id: true, reporterId: true, reportedId: true, conversationId: true },
  });
  let saved = 0;
  for (const r of reports) {
    const ids = [r.reporterId, r.reportedId].filter((x): x is string => !!x);
    const people = await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const person = (id: string | null) => {
      const p = people.find((x) => x.id === id);
      return p ? { id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), phone: p.phone } : null;
    };

    // The chat the report came from, else the chat these two had (if any)
    const chat =
      (r.conversationId && (await db.conversation.findUnique({ where: { id: r.conversationId }, select: { id: true } }))) ||
      (r.reporterId && r.reportedId
        ? await db.conversation.findFirst({
            where: {
              match: {
                OR: [
                  { femaleId: r.reporterId, maleId: r.reportedId },
                  { femaleId: r.reportedId, maleId: r.reporterId },
                ],
              },
            },
            select: { id: true },
          })
        : null);
    let transcript: { id: string; messages: { at: string; from: "reporter" | "reported"; body: string }[]; truncated: boolean } | null = null;
    if (chat) {
      const latest = await db.message.findMany({
        where: { conversationId: chat.id },
        orderBy: { createdAt: "desc" },
        take: EVIDENCE_MAX_MESSAGES + 1,
        select: { senderId: true, body: true, createdAt: true },
      });
      transcript = {
        id: chat.id,
        truncated: latest.length > EVIDENCE_MAX_MESSAGES,
        messages: latest
          .slice(0, EVIDENCE_MAX_MESSAGES)
          .reverse()
          .map((m) => ({ at: m.createdAt.toISOString(), from: m.senderId === r.reporterId ? "reporter" : "reported", body: m.body })),
      };
    }

    const { count } = await db.report.updateMany({
      where: { id: r.id, evidence: { equals: Prisma.DbNull } },
      data: {
        evidence: {
          capturedAt: new Date().toISOString(),
          people: { reporter: person(r.reporterId), reported: person(r.reportedId) },
          chat: transcript,
        },
      },
    });
    saved += count;
  }
  return saved;
}
