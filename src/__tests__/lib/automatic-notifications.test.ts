import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AUTOMATIC_GROUPS, AUTOMATIC_NOTIFICATIONS, automaticNotificationsFor } from "@/lib/notifications/automatic";

/** All source text that can send a message, this list itself left out */
function sources(dir: string): string {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .map((path) => {
      if (statSync(path).isDirectory()) return path.includes("__tests__") ? "" : sources(path);
      return /\.tsx?$/.test(path) && !path.endsWith("notifications/automatic.ts") ? readFileSync(path, "utf8") : "";
    })
    .join("\n");
}

describe("automatic notifications list", () => {
  const code = sources(join(process.cwd(), "src/lib")) + sources(join(process.cwd(), "src/app/api"));

  // Placeholders and the shared site name split a text; sentences may be joined from constants in the code
  const pieces = (text: string) =>
    text
      .split(/\{[^}]*\}|naseebak\.com|(?<=[.؟!:])\s/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 8);

  /** Messages the code assembles from parts: compared word by word */
  const COMPOSED = new Set(["suggestions-new-for-me", "intro-request-expired", "intro-request-reminder", "chat-unread-bell", "engagement-reengagement", "pro-credits"]);
  const found = (key: string, piece: string) =>
    code.includes(piece) || (COMPOSED.has(key) && piece.split(/\s+/).every((word) => code.includes(word.replace(/[.،]$/, ""))));

  it("every text matches what the code sends", () => {
    const missing = AUTOMATIC_NOTIFICATIONS.flatMap((n) =>
      n.texts.flatMap((t) => [...pieces(t.title), ...pieces(t.body)].filter((p) => !found(n.key, p)).map((p) => `${n.key}: ${p}`)),
    );
    expect(missing).toEqual([]);
  });

  it("keys are unique and every message belongs to a group", () => {
    const keys = AUTOMATIC_NOTIFICATIONS.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const n of AUTOMATIC_NOTIFICATIONS) expect(AUTOMATIC_GROUPS[n.group]).toBeDefined();
  });

  it("fills each country's package and price, with admin prices", () => {
    const line = (country: "JO" | "SA", prices?: Record<string, number>) =>
      automaticNotificationsFor(country, prices).flatMap((n) => n.texts.map((t) => t.body)).find((b) => b.includes("10 أرصدة"));
    expect(line("JO")).toContain("3 د.أ");
    expect(line("SA", { sa_10: 30 })).toContain("30 ر.س");
  });

  it("says Saudi sign-in codes go by WhatsApp", () => {
    const otp = (country: string) => automaticNotificationsFor(country).find((n) => n.key === "account-otp-code");
    expect(otp("SA")?.channels).toEqual(["whatsapp"]);
    expect(otp("JO")?.channels).toEqual(["sms"]);
  });
});
