/**
 * READ-ONLY report: compatibility score distribution for every eligible man/woman pair,
 * before and after the dealbreaker filter, and how many users would have 0 candidates
 * at a given minimum score. Writes nothing.
 *
 *   node scripts/score-distribution.ts                 # uses DATABASE_URL from .env
 *   DATABASE_URL=postgresql://… node scripts/score-distribution.ts
 *
 * "Eligible" = the same people auto-suggest would consider: role USER, not deactivated,
 * not suspended, not flagged, finished short setup (profile.isComplete).
 * Past suggestions / matches / blocks and the 30-day activity rule are NOT applied here
 * (they change every day) — this shows the raw pool.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { calculateCompatibility, mutuallyAcceptable } from "../src/lib/matching/score.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
if (!process.env.DATABASE_URL && fs.existsSync(envPath)) {
  const line = fs.readFileSync(envPath, "utf-8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (line) process.env.DATABASE_URL = line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "");
}

const THRESHOLDS = [30, 40, 50, 60];
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const users = await db.user.findMany({
  where: { role: "USER", isDeactivated: false, status: { not: "SUSPENDED" }, isFlagged: false, profile: { isComplete: true } },
  select: {
    id: true,
    gender: true,
    profile: true,
    personalityResult: { select: { vector: true, personalityType: true } },
    photos: { select: { id: true } },
    identityDoc: { select: { status: true } },
    parentInfo: { select: { id: true, parentName: true } },
  },
});

const men = users.filter((u) => u.gender === "MALE");
const women = users.filter((u) => u.gender === "FEMALE");

const bucketOf = (s: number) => (s < 30 ? "<30" : s >= 90 ? "90-100" : `${Math.floor(s / 10) * 10}-${Math.floor(s / 10) * 10 + 9}`);
const BUCKETS = ["<30", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-100"];
const all: Record<string, number> = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
const afterDb: Record<string, number> = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
// per user: candidate scores that pass both sides' dealbreakers
const perUser = new Map<string, number[]>(users.map((u) => [u.id, []]));

for (const m of men) {
  for (const w of women) {
    const score = calculateCompatibility(m as never, w as never);
    all[bucketOf(score)]++;
    if (mutuallyAcceptable(m as never, w as never)) {
      afterDb[bucketOf(score)]++;
      perUser.get(m.id)!.push(score);
      perUser.get(w.id)!.push(score);
    }
  }
}

const pairs = men.length * women.length;
console.log(`Database: ${process.env.DATABASE_URL?.replace(/\/\/[^@]*@/, "//***@")}`);
console.log(`Eligible users: ${users.length} (${men.length} men, ${women.length} women) → ${pairs} pairs\n`);
console.log("Score bucket | all pairs | after dealbreakers");
for (const b of BUCKETS) console.log(`${b.padEnd(12)} | ${String(all[b]).padStart(9)} | ${String(afterDb[b]).padStart(18)}`);

console.log("\nUsers with 0 candidates (after dealbreakers), by minimum score:");
for (const t of THRESHOLDS) {
  const zero = users.filter((u) => !perUser.get(u.id)!.some((s) => s >= t));
  const zm = zero.filter((u) => u.gender === "MALE").length;
  const median = (() => {
    const counts = users.map((u) => perUser.get(u.id)!.filter((s) => s >= t).length).sort((a, b) => a - b);
    return counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  })();
  console.log(`  ≥ ${t}: ${zero.length} of ${users.length} users (${zm} men, ${zero.length - zm} women); median candidates per user ${median}`);
}

await db.$disconnect();
