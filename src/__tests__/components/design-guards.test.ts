import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Lint-style guards for the design foundations (design review P1-1 / P1-2 / P1-7 / DS-13 / DS-22 / DS-23):
 * member pages and shared components never use text under 12 px, raw hex colours, the forbidden Tailwind palettes
 * or endless decorative animations. Admin (English, LTR) is out of scope.
 */
const ROOT = join(__dirname, "..", "..");
const SCAN = ["app/(ar)", "components"].map((d) => join(ROOT, d));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "admin") continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

const files = SCAN.flatMap((d) => walk(d)).filter((f) => !f.includes("admin-"));
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => relative(ROOT, f);

function offenders(re: RegExp, allow: (f: string) => boolean = () => false) {
  const hits: string[] = [];
  for (const f of files) {
    if (allow(rel(f))) continue;
    read(f)
      .split("\n")
      .forEach((line, i) => {
        if (re.test(line)) hits.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
  }
  return hits;
}

describe("design guards on member pages", () => {
  it("no text under 12 px (use text-caption)", () => {
    expect(offenders(/text-\[(\d|1[01])(\.\d+)?px\]/)).toEqual([]);
    expect(offenders(/fontSize:\s*["']?([0-9]|1[01])(px)?["',\s}]/)).toEqual([]);
  });

  it("no raw hex colours (tokens, or BRAND_HEX where CSS can't reach)", () => {
    // Country flags draw their real colours
    expect(offenders(/["'`(\s=]#[0-9a-fA-F]{6}\b|["'`(\s=]#[0-9a-fA-F]{3}\b/, (f) => f.endsWith("country-flag.tsx"))).toEqual([]);
  });

  it("no forbidden Tailwind palettes", () => {
    expect(
      offenders(/\b(bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|divide)-(blue|violet|purple|rose|pink|sky|cyan|indigo|slate|gray|orange)-\d/),
    ).toEqual([]);
  });

  it("no endless decorative pings (spinners, skeletons and the recording dot may move)", () => {
    expect(offenders(/animate-ping|infinite alternate|_infinite\]/)).toEqual([]);
  });
});
