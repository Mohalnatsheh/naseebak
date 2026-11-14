import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Guard: the blurred preview goes only into pre-match payloads about another member (spec
 * docs/superpowers/specs/2026-11-14-blurred-photo-preview-design.md). A new place that adds it must be listed here on
 * purpose; match, chat, admin and my-own-profile code must never send it.
 */
const ROOT = join(__dirname, "..", "..");
const ALLOWED = new Set([
  "lib/photos/preview-payload.ts",
  "lib/suggestions/feed.ts",
  "app/api/suggestions/route.ts",
  "app/api/suggestions/sent/route.ts",
  "app/api/interests/received/route.ts",
]);
/** Areas that must never carry it (real photos after a match, admin, my own profile) */
const NEVER = [/^app\/api\/matches\//, /^app\/api\/chats\//, /^app\/api\/admin\//, /^app\/\(en\)\/admin\//, /^app\/api\/profile\//, /^app\/api\/mobile\//, /^lib\/chat\//, /^lib\/admin\//, /^lib\/matches\//, /^lib\/intro\//, /^lib\/mobile-me\.ts$/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const sources = files(ROOT).map((p) => ({ rel: relative(ROOT, p).split("\\").join("/"), text: readFileSync(p, "utf8") }));

describe("photoPreview guard", () => {
  it("only the listed server files add the preview", () => {
    const users = sources
      .filter((s) => /withPhotoPreview|previewSelect|primaryPhotoPreview|blurPreview/.test(s.text))
      .map((s) => s.rel)
      .filter((rel) => !rel.startsWith("lib/photos/") && !rel.startsWith("app/api/profile/photos"));
    expect(users.filter((rel) => !ALLOWED.has(rel))).toEqual([]);
  });

  it("match, chat, admin and own-profile code never mention photoPreview", () => {
    const offenders = sources.filter((s) => NEVER.some((re) => re.test(s.rel)) && /photoPreview|withPhotoPreview|blurPreview/.test(s.text));
    // The photo routes keep the stored preview current (Task 1) but never send it
    const sending = offenders.filter((s) => !s.rel.startsWith("app/api/profile/photos") || /photoPreview/.test(s.text));
    expect(sending.map((s) => s.rel)).toEqual([]);
  });
});
