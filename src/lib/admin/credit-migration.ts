/**
 * One-time credit top-up for the new user cycle — the same logic as scripts/new-cycle-migrate.mjs,
 * runnable from Admin → Settings. Idempotent: the marker row is created first inside the
 * transaction, so a second run (or two admins clicking at once) changes nothing.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCycleFlags } from "@/lib/settings";

export const MIGRATION_MARKER = "migration_new_cycle_v1";
export const MIGRATION_MIN_CREDITS = 3;

export type MigrationResult =
  | { ok: true; users: number; toppedUp: number; at: string }
  | { ok: false; reason: "SWITCH_OFF" | "ALREADY_DONE"; at?: string };

export async function previewCreditMigration() {
  const users = await db.user.findMany({ where: { role: "USER" }, select: { matchCredits: true } });
  return { users: users.length, toppedUp: users.filter((u) => u.matchCredits < MIGRATION_MIN_CREDITS).length };
}

export async function runCreditMigration(adminId: string): Promise<MigrationResult> {
  const { introRequests } = await getCycleFlags();
  if (!introRequests) return { ok: false, reason: "SWITCH_OFF" };

  const at = new Date().toISOString();
  try {
    return await db.$transaction(async (tx) => {
      await tx.systemSetting.create({ data: { key: MIGRATION_MARKER, value: at } });
      const users = await tx.user.findMany({ where: { role: "USER" }, select: { id: true, matchCredits: true } });
      const toTopUp = users.filter((u) => u.matchCredits < MIGRATION_MIN_CREDITS);
      await tx.user.updateMany({
        where: { role: "USER", matchCredits: { lt: MIGRATION_MIN_CREDITS } },
        data: { matchCredits: MIGRATION_MIN_CREDITS },
      });
      await tx.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: "SYSTEM" as const,
          title: "نظام رصيد جديد",
          body: "أصبح الرصيد يُستخدم فقط عند إرسال طلب تعارف عائلي أو طلب محادثة، والاقتراحات أصبحت مجانية. أهديناك رصيداً ليصبح 3 على الأقل.",
          metadata: { url: "/dashboard/payments" },
        })),
      });
      await tx.creditLedger.createMany({
        data: toTopUp.map((u) => ({
          userId: u.id,
          delta: MIGRATION_MIN_CREDITS - u.matchCredits,
          reason: "MIGRATION_GIFT" as const,
          adminId,
          note: MIGRATION_MARKER,
        })),
      });
      return { ok: true as const, users: users.length, toppedUp: toTopUp.length, at };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const done = await db.systemSetting.findUnique({ where: { key: MIGRATION_MARKER } });
      return { ok: false, reason: "ALREADY_DONE", at: done?.value };
    }
    throw error;
  }
}
