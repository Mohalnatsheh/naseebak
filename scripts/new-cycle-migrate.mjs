/**
 * One-time step for the new user cycle (also available as Admin → Settings → "Run credit top-up",
 * src/lib/admin/credit-migration.ts — same marker, so only one of them ever runs). Run it right AFTER turning on
 * Admin → Settings → "Family and chat requests" (its notice describes the new rules).
 *
 *   node scripts/new-cycle-migrate.mjs --dry-run   # show what would change
 *   node scripts/new-cycle-migrate.mjs             # apply (safe to re-run: runs once)
 *
 * - Tops every user below 3 credits up to 3 (paid balances above 3 are untouched)
 * - Sends every user a SYSTEM notification explaining the new credit rules
 * - Writes a MIGRATION_GIFT row in the credit history for every topped-up user
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.substring(0, eqIdx);
    let value = trimmed.substring(eqIdx + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const MARKER = "migration_new_cycle_v1";
const MIN_CREDITS = 3;
const dryRun = process.argv.includes("--dry-run");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const done = await db.systemSetting.findUnique({ where: { key: MARKER } });
  if (done) {
    console.log(`Already applied on ${done.value}. Nothing to do.`);
    return;
  }
  const switchOn = await db.systemSetting.findUnique({ where: { key: "intro_requests_enabled" } });
  if (switchOn?.value !== "true") {
    console.log("Turn on Admin → Settings → \"Family and chat requests\" first. Nothing changed.");
    process.exitCode = 1;
    return;
  }

  const users = await db.user.findMany({ where: { role: "USER" }, select: { id: true, matchCredits: true } });
  const toTopUp = users.filter((u) => u.matchCredits < MIN_CREDITS);
  console.log(`Users: ${users.length} · topped up to ${MIN_CREDITS}: ${toTopUp.length} · notified: ${users.length}`);
  if (dryRun) {
    console.log("Dry run — nothing written.");
    return;
  }

  await db.$transaction([
    db.user.updateMany({ where: { role: "USER", matchCredits: { lt: MIN_CREDITS } }, data: { matchCredits: MIN_CREDITS } }),
    db.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: "SYSTEM",
        title: "نظام رصيد جديد",
        body: "أصبح الرصيد يُستخدم فقط عند إرسال طلب تعارف عائلي أو طلب محادثة، والاقتراحات أصبحت مجانية. أهديناك رصيداً ليصبح ٣ على الأقل.",
        metadata: { url: "/dashboard/payments" },
      })),
    }),
    db.creditLedger.createMany({
      data: toTopUp.map((u) => ({
        userId: u.id,
        delta: MIN_CREDITS - u.matchCredits,
        reason: "MIGRATION_GIFT",
        note: MARKER,
      })),
    }),
    db.systemSetting.create({ data: { key: MARKER, value: new Date().toISOString() } }),
  ]);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
