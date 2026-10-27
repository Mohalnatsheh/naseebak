// Admin view of a weekly question: every count, split by where the vote came from and who cast it.
import { db } from "@/lib/db";
import { parseOptions, TEST_SOURCE } from "@/lib/engagement/polls";

export interface OptionBreakdown {
  id: string;
  label: string;
  total: number;
  members: number;
  visitors: number;
  women: number;
  men: number;
  instagram: number;
  dashboard: number;
}

export async function pollBreakdown(pollId: string, optionsJson: Parameters<typeof parseOptions>[0]) {
  const rows = await db.pollVote.groupBy({ by: ["optionId", "gender", "source"], where: { pollId }, _count: { _all: true } });
  const options = parseOptions(optionsJson);
  const byOption = new Map<string, OptionBreakdown>(
    options.map((o) => [o.id, { id: o.id, label: o.label, total: 0, members: 0, visitors: 0, women: 0, men: 0, instagram: 0, dashboard: 0 }]),
  );
  let testVotes = 0;
  for (const r of rows) {
    const n = r._count._all;
    if (r.source === TEST_SOURCE) {
      testVotes += n;
      continue;
    }
    const b = byOption.get(r.optionId);
    if (!b) continue;
    b.total += n;
    if (r.gender) b.members += n;
    else b.visitors += n;
    if (r.gender === "FEMALE") b.women += n;
    if (r.gender === "MALE") b.men += n;
    if (r.source === "instagram") b.instagram += n;
    if (r.source === "dashboard") b.dashboard += n;
  }
  return { options: [...byOption.values()], testVotes };
}
