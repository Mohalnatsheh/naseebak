/**
 * Popup alerts from the admin (admin → «Popup Alerts»): shown in the app and/or on the website dashboard, once per
 * member — closing it or tapping its button records an AlertDismissal and it never shows to them again.
 * Audience: everyone, men, women or one member; channel: app, website or both; the admin's selected country
 * (null = every country); between startsAt and endsAt, unless stopped. Members see the oldest one waiting first.
 */
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

export const ALERT_AUDIENCES = ["ALL", "MEN", "WOMEN", "USER"] as const;
export const ALERT_CHANNELS = ["ALL", "APP", "WEB"] as const;
export type AlertPlatform = "app" | "web";

/** What a member's popup needs (never the targeting) */
export interface MemberAlert {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
}

/** An in-site path ("/dashboard/...", never "//host") or an https link */
export function isAlertLink(url: string): boolean {
  if (url.startsWith("/")) return !url.startsWith("//");
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

export const alertInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(120),
    body: z.string().trim().min(1, "Text is required").max(2000),
    buttonLabel: optionalText(40),
    buttonUrl: optionalText(500).refine((u) => u === undefined || isAlertLink(u), {
      message: "The button link must be a site path (/dashboard/...) or an https:// link",
    }),
    audience: z.enum(ALERT_AUDIENCES).default("ALL"),
    userId: optionalText(64),
    channel: z.enum(ALERT_CHANNELS).default("ALL"),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    /** data:image/(jpeg|png|webp);base64,… — uploaded by the route */
    image: optionalText(4_000_000),
  })
  .refine((a) => !a.buttonLabel === !a.buttonUrl, {
    message: "A button needs both a label and a link",
    path: ["buttonUrl"],
  })
  .refine((a) => a.audience !== "USER" || !!a.userId, { message: "Choose the member", path: ["userId"] })
  .refine((a) => !a.endsAt || a.endsAt > (a.startsAt ?? new Date()), {
    message: "The end must be after the start",
    path: ["endsAt"],
  });
export type AlertInput = z.infer<typeof alertInputSchema>;

/** The alerts `user` should see now on `platform`, oldest first, not yet closed */
export function memberAlertsWhere(
  user: { id: string; gender: "MALE" | "FEMALE"; country: string },
  platform: AlertPlatform,
  now = new Date(),
): Prisma.AlertWhereInput {
  return {
    stoppedAt: null,
    startsAt: { lte: now },
    AND: [
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      { OR: [{ country: null }, { country: user.country }] },
      {
        OR: [
          { audience: "ALL" },
          { audience: user.gender === "MALE" ? "MEN" : "WOMEN" },
          { audience: "USER", userId: user.id },
        ],
      },
    ],
    channel: { in: ["ALL", platform === "app" ? "APP" : "WEB"] },
    dismissals: { none: { userId: user.id } },
  };
}

export async function currentAlertFor(userId: string, platform: AlertPlatform, now = new Date()): Promise<MemberAlert | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, gender: true, country: true } });
  if (!user) return null;
  return db.alert.findFirst({
    where: memberAlertsWhere(user, platform, now),
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, body: true, imageUrl: true, buttonLabel: true, buttonUrl: true },
  });
}

/** Closed (or its button tapped): never again for this member. Idempotent; false when there is no such alert. */
export async function dismissAlert(userId: string, alertId: string): Promise<boolean> {
  const alert = await db.alert.findUnique({ where: { id: alertId }, select: { id: true } });
  if (!alert) return false;
  await db.alertDismissal.createMany({ data: [{ alertId, userId }], skipDuplicates: true });
  return true;
}
