import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { offerOpenAt, parseOfferDate, parseOfferPercent } from "@/lib/payments/offer";

/**
 * Sale offer (lib/payments/offer, e.g. «عروض الجمعة البيضاء»): +percent% credits on purchases and the first Pro
 * payment between startsAt and endsAt (UTC instants). percent 0 = off. Settings are cached 30 s.
 */
async function state() {
  const [percentRaw, startsRaw, endsRaw, title] = await Promise.all([
    getSetting("offer_bonus_percent"),
    getSetting("offer_starts_at"),
    getSetting("offer_ends_at"),
    getSetting("offer_title"),
  ]);
  const percent = parseOfferPercent(percentRaw);
  const startsAt = parseOfferDate(startsRaw);
  const endsAt = parseOfferDate(endsRaw);
  const now = new Date();
  const status =
    percent === 0 || !startsAt || !endsAt
      ? "off"
      : offerOpenAt({ percent, startsAt, endsAt, title }, now)
        ? "active"
        : now < startsAt
          ? "scheduled"
          : "ended";
  return { percent, startsAt: startsAt?.toISOString() ?? null, endsAt: endsAt?.toISOString() ?? null, title, status };
}

export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    return NextResponse.json(await state());
  } catch (error) {
    console.error("Get offer settings error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const schema = z
  .object({
    percent: z.number().int().min(0).max(100),
    startsAt: z.iso.datetime().nullable(),
    endsAt: z.iso.datetime().nullable(),
    title: z.string().trim().max(60),
  })
  .refine((d) => d.percent === 0 || (!!d.startsAt && !!d.endsAt), { message: "Start and end are required" })
  .refine((d) => !d.startsAt || !d.endsAt || new Date(d.endsAt) > new Date(d.startsAt), { message: "End must be after start" });

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
    const d = parsed.data;
    await setSetting("offer_bonus_percent", String(d.percent));
    await setSetting("offer_starts_at", d.startsAt ?? "");
    await setSetting("offer_ends_at", d.endsAt ?? "");
    await setSetting("offer_title", d.title);
    console.log(`[admin settings] offer ${d.percent}% ${d.startsAt}..${d.endsAt} by ${result.session.user.id}`);
    return NextResponse.json(await state());
  } catch (error) {
    console.error("Update offer settings error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
