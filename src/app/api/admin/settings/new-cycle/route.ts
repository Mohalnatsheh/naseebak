import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth";
import { getCycleFlags, getSetting, setSetting } from "@/lib/settings";
import { db } from "@/lib/db";
import { closeLegacyInFlight } from "@/lib/suggestions/mutual";

async function state() {
  const [flags, chatRaw, mutualRaw, creditRaw, activeFirstRaw, saRelaxedRaw, lbRelaxedRaw, freeReplyRaw, proRaw, chatDeleteRaw, migration] = await Promise.all([
    getCycleFlags(),
    getSetting("chat_enabled"),
    getSetting("new_suggestions_flow"),
    getSetting("credit_on_interest"),
    getSetting("feed_active_first"),
    getSetting("sa_relaxed_matching"),
    getSetting("lb_relaxed_matching"),
    getSetting("free_interest_reply"),
    getSetting("pro_enabled"),
    getSetting("chat_delete_enabled"),
    db.systemSetting.findUnique({ where: { key: "migration_new_cycle_v1" } }),
  ]);
  return {
    introRequests: flags.introRequests,
    chat: chatRaw === "true",
    mutualSuggestions: mutualRaw === "true",
    creditOnInterest: creditRaw === "true",
    activeFirstFeed: activeFirstRaw === "true",
    saRelaxedMatching: saRelaxedRaw === "true",
    lbRelaxedMatching: lbRelaxedRaw === "true",
    freeInterestReply: freeReplyRaw === "true",
    proEnabled: proRaw === "true",
    chatDeleteEnabled: chatDeleteRaw === "true",
    creditsMigratedAt: migration?.value ?? null,
  };
}

export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    return NextResponse.json(await state());
  } catch (error) {
    console.error("Get new cycle settings error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const schema = z.object({
  introRequests: z.boolean().optional(),
  chat: z.boolean().optional(),
  mutualSuggestions: z.boolean().optional(),
  creditOnInterest: z.boolean().optional(),
  activeFirstFeed: z.boolean().optional(),
  saRelaxedMatching: z.boolean().optional(),
  lbRelaxedMatching: z.boolean().optional(),
  freeInterestReply: z.boolean().optional(),
  /** Pro membership: new sales and offers only; members already subscribed keep Pro */
  proEnabled: z.boolean().optional(),
  /** Pro members delete a message or clear a chat; off hides the buttons only, earlier deletions stay hidden */
  chatDeleteEnabled: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    if (parsed.data.introRequests !== undefined) {
      await setSetting("intro_requests_enabled", String(parsed.data.introRequests));
    }
    if (parsed.data.chat !== undefined) {
      await setSetting("chat_enabled", String(parsed.data.chat));
    }
    if (parsed.data.mutualSuggestions !== undefined) {
      await setSetting("new_suggestions_flow", String(parsed.data.mutualSuggestions));
    }
    if (parsed.data.creditOnInterest !== undefined) {
      await setSetting("credit_on_interest", String(parsed.data.creditOnInterest));
      // Going live: older-style suggestions in flight are closed (owner decision), shared flow only
      if (parsed.data.creditOnInterest) await closeLegacyInFlight();
    }
    if (parsed.data.activeFirstFeed !== undefined) {
      await setSetting("feed_active_first", String(parsed.data.activeFirstFeed));
    }
    if (parsed.data.saRelaxedMatching !== undefined) {
      await setSetting("sa_relaxed_matching", String(parsed.data.saRelaxedMatching));
    }
    if (parsed.data.lbRelaxedMatching !== undefined) {
      await setSetting("lb_relaxed_matching", String(parsed.data.lbRelaxedMatching));
    }
    if (parsed.data.freeInterestReply !== undefined) {
      await setSetting("free_interest_reply", String(parsed.data.freeInterestReply));
    }
    if (parsed.data.proEnabled !== undefined) {
      await setSetting("pro_enabled", String(parsed.data.proEnabled));
      console.log(`[admin settings] pro_enabled=${parsed.data.proEnabled} by ${result.session.user.id}`);
    }
    if (parsed.data.chatDeleteEnabled !== undefined) {
      await setSetting("chat_delete_enabled", String(parsed.data.chatDeleteEnabled));
      console.log(`[admin settings] chat_delete_enabled=${parsed.data.chatDeleteEnabled} by ${result.session.user.id}`);
    }
    // Credit on interest depends on both: turning either off turns it off too, so switching
    // them back on later never silently re-enables it
    if (parsed.data.mutualSuggestions === false || parsed.data.introRequests === false) {
      await setSetting("credit_on_interest", "false");
    }
    // The free reply depends on credit on interest: off with it, so turning that back on never revives it silently
    if (parsed.data.creditOnInterest === false || parsed.data.mutualSuggestions === false || parsed.data.introRequests === false) {
      await setSetting("free_interest_reply", "false");
    }
    return NextResponse.json(await state());
  } catch (error) {
    console.error("Update new cycle settings error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
