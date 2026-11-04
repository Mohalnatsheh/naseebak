import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAdminCountry } from "@/lib/admin/country-filter";

const WEEKS = 8;
const num = (v: unknown) => Number(v ?? 0);

/**
 * Admin dashboard → «Growth & retention» (owner request 2026-11-04), for the admin's selected country:
 * - active: members seen today / 7 / 30 days (`lastActiveAt`) out of every open account
 * - cohorts: members by sign-up week (Amman, weeks start Saturday) and how far each got: finished setup, first «مهتم»,
 *   a match, a chat, a payment, and seen in the last 7 days
 * - interest: «مهتم» given per week (shared cards) and how many became a match / got any answer; a week whose cards
 *   are still open (given < 7 days ago) is marked `open` because its answers are still coming
 * Shared cards: `femaleId` = recipientId and `maleId` = candidateId (either gender); mutual_matches use the real genders.
 */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const country = await getAdminCountry(request);
    const inCountry = country === "ALL" ? Prisma.empty : Prisma.sql`AND u.country = ${country}`;

    const [active] = await db.$queryRaw<{ d1: bigint; d7: bigint; d30: bigint; total: bigint }[]>`
      SELECT count(*) FILTER (WHERE u."lastActiveAt" > now() AT TIME ZONE 'UTC' - interval '1 day') AS d1,
             count(*) FILTER (WHERE u."lastActiveAt" > now() AT TIME ZONE 'UTC' - interval '7 days') AS d7,
             count(*) FILTER (WHERE u."lastActiveAt" > now() AT TIME ZONE 'UTC' - interval '30 days') AS d30,
             count(*) AS total
      FROM users u WHERE u.role = 'USER' AND NOT u."isDeactivated" AND u.status <> 'SUSPENDED' ${inCountry}`;

    // Amman weeks starting Saturday: shift by 2 days so date_trunc('week') (Monday) lands on Saturday
    const cohorts = await db.$queryRaw<
      { week: string; joined: bigint; women: bigint; setup: bigint; interest: bigint; matched: bigint; chatted: bigint; paid: bigint; active7: bigint }[]
    >`
      WITH c AS (
        SELECT u.id, u.gender, u."lastActiveAt",
               (date_trunc('week', (u."createdAt" + interval '3 hours') + interval '2 days') - interval '2 days')::date AS week
        FROM users u
        WHERE u.role = 'USER' ${inCountry}
          AND u."createdAt" + interval '3 hours' >= (date_trunc('week', (now() AT TIME ZONE 'UTC' + interval '3 hours') + interval '2 days') - interval '2 days') - ${WEEKS - 1} * interval '7 days'
      )
      SELECT to_char(c.week, 'YYYY-MM-DD') AS week, count(*) AS joined,
        count(*) FILTER (WHERE c.gender = 'FEMALE') AS women,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM profiles p WHERE p."userId" = c.id AND p."isComplete")) AS setup,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM suggestions s WHERE s.flow = 'MUTUAL'
          AND ((s."femaleId" = c.id AND s."recipientDecision" = 'INTERESTED') OR (s."maleId" = c.id AND s."candidateDecision" = 'INTERESTED')))) AS interest,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM mutual_matches m WHERE m."femaleId" = c.id OR m."maleId" = c.id)) AS matched,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM conversations v JOIN mutual_matches m ON m.id = v."matchId" WHERE m."femaleId" = c.id OR m."maleId" = c.id)) AS chatted,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM payments pay WHERE pay."userId" = c.id AND pay.status = 'COMPLETED')) AS paid,
        count(*) FILTER (WHERE c."lastActiveAt" > now() AT TIME ZONE 'UTC' - interval '7 days') AS active7
      FROM c GROUP BY c.week ORDER BY c.week DESC`;

    const interest = await db.$queryRaw<{ week: string; given: bigint; matched: bigint; answered: bigint; open: boolean }[]>`
      WITH sides AS (
        SELECT s."femaleId" AS who, s."recipientDecidedAt" AS at, s."candidateDecision" AS theirs
        FROM suggestions s WHERE s.flow = 'MUTUAL' AND s."recipientDecision" = 'INTERESTED'
        UNION ALL
        SELECT s."maleId", s."candidateDecidedAt", s."recipientDecision"
        FROM suggestions s WHERE s.flow = 'MUTUAL' AND s."candidateDecision" = 'INTERESTED'
      ), w AS (
        SELECT (date_trunc('week', (x.at + interval '3 hours') + interval '2 days') - interval '2 days')::date AS week, x.theirs
        FROM sides x JOIN users u ON u.id = x.who
        WHERE x.at IS NOT NULL ${inCountry}
          AND x.at + interval '3 hours' >= (date_trunc('week', (now() AT TIME ZONE 'UTC' + interval '3 hours') + interval '2 days') - interval '2 days') - ${WEEKS - 1} * interval '7 days'
      )
      SELECT to_char(week, 'YYYY-MM-DD') AS week, count(*) AS given,
        count(*) FILTER (WHERE theirs = 'INTERESTED') AS matched,
        count(*) FILTER (WHERE theirs IS NOT NULL) AS answered,
        (week + 14 > (now() AT TIME ZONE 'UTC' + interval '3 hours')::date) AS open
      FROM w GROUP BY week ORDER BY week DESC`;

    return NextResponse.json({
      active: { d1: num(active?.d1), d7: num(active?.d7), d30: num(active?.d30), total: num(active?.total) },
      cohorts: cohorts.map((c) => ({
        week: c.week, joined: num(c.joined), women: num(c.women), setup: num(c.setup), interest: num(c.interest),
        matched: num(c.matched), chatted: num(c.chatted), paid: num(c.paid), active7: num(c.active7),
      })),
      interest: interest.map((i) => ({ week: i.week, given: num(i.given), matched: num(i.matched), answered: num(i.answered), open: i.open })),
    });
  } catch (error) {
    console.error("Admin growth error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
