/**
 * «باقي خطوة لإتمام شحن رصيدك» (owner request 2026-11-05): most failed payments are members who open the payment and
 * leave (no card ever tried). A member who started a payment 50 minutes to 12 hours ago, didn't pay it and hasn't paid
 * since gets one push + bell (never SMS), at most once per payment and once per Amman day, never at night (23:00–09:00,
 * the next run after 09:00 sends it). Runs every 15 minutes (`naseebak-daily-job frequent`).
 */
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { isUnavailable } from "@/lib/matches/state";
import { isTestPhone } from "@/lib/test-accounts";

export const UNPAID_TITLE = "باقي خطوة لإتمام شحن رصيدك";
const MIN = 60 * 1000;
const FROM_MIN = 50;
const TO_HOURS = 12;

/** Amman night: no reminders 23:00–09:00 */
export function isQuietHour(now: Date): boolean {
  const h = (now.getUTCHours() + 3) % 24;
  return h >= 23 || h < 9;
}

export function unpaidBody(female: boolean): string {
  return female
    ? "اخترتِ باقة ولم يكتمل الدفع. أكملي بثوانٍ، والرصيد يعود لكِ تلقائياً إذا لم يردّ الطرف الآخر."
    : "اخترت باقة ولم يكتمل الدفع. أكمل بثوانٍ، والرصيد يعود لك تلقائياً إذا لم يردّ الطرف الآخر.";
}

export async function remindUnpaidPayments(now = new Date()): Promise<{ payments: number; reminded: number }> {
  if (isQuietHour(now)) return { payments: 0, reminded: 0 };
  const rows = await db.payment.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      createdAt: { lte: new Date(now.getTime() - FROM_MIN * MIN), gte: new Date(now.getTime() - TO_HOURS * 60 * MIN) },
      userId: { not: null },
    },
    select: { id: true, userId: true, createdAt: true, user: { select: { gender: true, role: true, phone: true, isDeactivated: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });

  const seen = new Set<string>();
  let reminded = 0;
  for (const p of rows) {
    const userId = p.userId!;
    // One per member per run (their latest unpaid payment)
    if (seen.has(userId)) continue;
    seen.add(userId);
    const u = p.user;
    if (!u || u.role !== "USER" || isUnavailable(u) || isTestPhone(u.phone)) continue;
    // Paid since (this payment or a later one): nothing to remind
    const paid = await db.payment.findFirst({ where: { userId, status: "COMPLETED", createdAt: { gte: p.createdAt } }, select: { id: true } });
    if (paid) continue;
    // Already reminded about this payment (or a newer one)
    const told = await db.notification.findFirst({ where: { userId, title: UNPAID_TITLE, createdAt: { gte: p.createdAt } }, select: { id: true } });
    if (told) continue;
    await notify({
      userId,
      type: "PAYMENT",
      title: UNPAID_TITLE,
      body: unpaidBody(u.gender === "FEMALE"),
      url: "/dashboard/payments",
      metadata: { paymentId: p.id },
      oncePerDay: "unpaid-payment",
      sms: false,
    });
    reminded++;
  }
  return { payments: rows.length, reminded };
}
