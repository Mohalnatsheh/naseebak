/**
 * One way to file a report, used by the match card (POST /api/reports) and by «إنهاء وإبلاغ» in a
 * chat: a repeat report about the same person reopens the earlier one and keeps both accounts of what
 * happened, and every report counts toward the automatic flag (3+ different people).
 */
import { Prisma, type ReportReason } from "@prisma/client";
import { db } from "@/lib/db";

/** Reports from this many different people flag an account (no new suggestions, admin attention) */
export const AUTO_FLAG_REPORTS = 3;
/** Stored details are capped so a long run of repeat reports can't grow without limit */
const MAX_STORED_DETAILS = 5000;

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
    select: { id: true, details: true },
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
  return { id, reopened: !!existing, flagged };
}

/** Flag the account once reports from enough different people are open or upheld. */
async function recountFlag(reportedId: string): Promise<boolean> {
  const count = await db.report.count({ where: { reportedId, status: { in: ["PENDING", "REVIEWED"] } } });
  if (count < AUTO_FLAG_REPORTS) return false;
  await db.user.updateMany({
    where: { id: reportedId, isFlagged: false },
    data: { isFlagged: true, flagReason: `Auto-flagged: ${count} reports from different users` },
  });
  return true;
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
