/**
 * «وسّع شروطك» (owner request 2026-11-05): an active member with no suggestions because of their own «شروط أساسية» gets
 * one push + bell (never SMS) naming the filter and how many people it would bring, at most once in 7 days. It opens
 * «جديدة», where both the website and the app already have the filter editor. Runs in the evening part.
 */
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { memberSuggestStatus } from "@/lib/admin/members-suggest-reason";
import { filterTip, filterTipText } from "@/lib/matching/filter-tip";
import { testPhones } from "@/lib/test-accounts";

export const FILTER_TIP_TITLE = "شروطك تقلّل اقتراحاتك";
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_DAYS = 7;
const EVERY_DAYS = 7;

export async function sendFilterTips(now = new Date()): Promise<{ members: number; sent: number }> {
  const since = new Date(now.getTime() - EVERY_DAYS * DAY_MS);
  const members = await db.user.findMany({
    where: {
      role: "USER",
      isDeactivated: false,
      status: { not: "SUSPENDED" },
      isFlagged: false,
      lastActiveAt: { gte: new Date(now.getTime() - ACTIVE_DAYS * DAY_MS) },
      phone: { notIn: testPhones() },
      profile: { isComplete: true, dealbreakers: { isEmpty: false } },
      notifications: { none: { title: FILTER_TIP_TITLE, createdAt: { gte: since } } },
    },
    select: { id: true, gender: true },
    orderBy: { lastActiveAt: "desc" },
  });

  let sent = 0;
  // One at a time: a slow evening job is fine, a slow site isn't
  for (const m of members) {
    const status = await memberSuggestStatus(m.id, now);
    if (status?.reason !== "no_candidates") continue;
    const tip = await filterTip(m.id, now);
    if (!tip) continue;
    const female = m.gender === "FEMALE";
    await notify({
      userId: m.id,
      type: "SUGGESTION",
      title: FILTER_TIP_TITLE,
      body: `${filterTipText(tip, female)} ${female ? "القرار لكِ، ويمكنكِ تعديل شروطكِ من صفحة الاقتراحات." : "القرار لك، ويمكنك تعديل شروطك من صفحة الاقتراحات."}`,
      url: "/dashboard/suggestions?tab=new",
      metadata: { filter: tip.key, gain: tip.gain },
      oncePerDay: "filter-tip",
      sms: false,
    });
    sent++;
  }
  return { members: members.length, sent };
}
