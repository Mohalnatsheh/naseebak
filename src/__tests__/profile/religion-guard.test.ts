import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const WRITE = /\b(db|tx)\.profile\.(update|upsert|updateMany|create)\b/;
const GUARDED = /stripMuslimOnlyForChristian|buildProfileUpdate/;

/** Profile write paths that may skip the Christian strip, with the reason */
const ALLOWED: Record<string, string> = {
  "src/app/api/profile/avatar/route.ts": "photo only",
  "src/lib/admin/change-gender.ts": "clears hijab and beard itself",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return path.includes("__tests__") ? [] : files(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

/** Files under `dir` that write a profile without the strip (or an allowlisted reason) */
function unguarded(dir: string, allowed: string[]): string[] {
  return files(dir)
    .map((p) => relative(ROOT, p))
    .filter((rel) => {
      const text = readFileSync(join(ROOT, rel), "utf8");
      return WRITE.test(text) && !GUARDED.test(text) && !allowed.includes(rel);
    });
}

describe("religion guard", () => {
  it("every profile write path strips Muslim-only answers for Christians", () => {
    expect(unguarded(join(ROOT, "src"), Object.keys(ALLOWED))).toEqual([]);
  });

  it("admin approval strips Muslim-only answers", () => {
    expect(readFileSync(join(ROOT, "src/lib/admin/profile-changes.ts"), "utf8")).toContain("stripMuslimOnlyForChristian");
  });

  it("allowlist has no stale entries", () => {
    for (const path of Object.keys(ALLOWED)) {
      expect(existsSync(join(ROOT, path)), path).toBe(true);
      expect(WRITE.test(readFileSync(join(ROOT, path), "utf8")), `${path} no longer writes a profile`).toBe(true);
    }
  });
});
