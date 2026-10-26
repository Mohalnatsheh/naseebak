/**
 * READ-ONLY report: compatibility score distribution for every eligible man/woman pair,
 * before and after the dealbreaker filter, and how many users would have 0 candidates
 * at a given minimum score. Writes nothing. One report per country (members are only
 * ever paired within their own `User.country`).
 *
 *   node scripts/score-distribution.ts                 # uses DATABASE_URL from .env
 *   DATABASE_URL=postgresql://… node scripts/score-distribution.ts
 *   COUNTRY=SA node scripts/score-distribution.ts      # one country only
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
const onlyCountry = process.env.COUNTRY?.trim().toUpperCase() || undefined;

const users = await db.user.findMany({
  where: {
    role: "USER", isDeactivated: false, status: { not: "SUSPENDED" }, isFlagged: false, profile: { isComplete: true },
    ...(onlyCountry && { country: onlyCountry }),
  },
  select: {
    id: true,
    gender: true,
    country: true,
    profile: true,
    personalityResult: { select: { vector: true, personalityType: true } },
    photos: { select: { id: true } },
    identityDoc: { select: { status: true } },
    parentInfo: { select: { id: true, parentName: true } },
  },
});

const bucketOf = (s: number) => (s < 30 ? "<30" : s >= 90 ? "90-100" : `${Math.floor(s / 10) * 10}-${Math.floor(s / 10) * 10 + 9}`);
const BUCKETS = ["<30", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-100"];

console.log(`Database: ${process.env.DATABASE_URL?.replace(/\/\/[^@]*@/, "//***@")}`);

function report(country: string, pool: typeof users) {
  const men = pool.filter((u) => u.gender === "MALE");
  const women = pool.filter((u) => u.gender === "FEMALE");
  const all: Record<string, number> = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  const afterDb: Record<string, number> = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  // per user: candidate scores that pass both sides' dealbreakers
  const perUser = new Map<string, number[]>(pool.map((u) => [u.id, []]));

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
  console.log(`\n=== Country ${country} ===`);
  console.log(`Eligible users: ${pool.length} (${men.length} men, ${women.length} women) → ${pairs} pairs\n`);
  console.log("Score bucket | all pairs | after dealbreakers");
  for (const b of BUCKETS) console.log(`${b.padEnd(12)} | ${String(all[b]).padStart(9)} | ${String(afterDb[b]).padStart(18)}`);

  console.log("\nUsers with 0 candidates (after dealbreakers), by minimum score:");
  for (const t of THRESHOLDS) {
    const zero = pool.filter((u) => !perUser.get(u.id)!.some((s) => s >= t));
    const zm = zero.filter((u) => u.gender === "MALE").length;
    const median = (() => {
      const counts = pool.map((u) => perUser.get(u.id)!.filter((s) => s >= t).length).sort((a, b) => a - b);
      return counts.length ? counts[Math.floor(counts.length / 2)] : 0;
    })();
    console.log(`  ≥ ${t}: ${zero.length} of ${pool.length} users (${zm} men, ${zero.length - zm} women); median candidates per user ${median}`);
  }
}

// Same-country pairs only, like auto-suggest
const countries = [...new Set(users.map((u) => u.country))].sort();
if (countries.length === 0) console.log("\nNo eligible users.");
for (const c of countries) report(c, users.filter((u) => u.country === c));

await db.$disconnect();
