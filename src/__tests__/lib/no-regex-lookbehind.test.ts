import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regex lookbehind (`(?<=` / `(?<!`) throws "invalid group specifier" on Safari before iOS 16.4. The build turns
 * such a pattern into `RegExp("…")`, so the page still loads and the error only shows when the code runs: in the
 * chat filter it froze every send on older iPhones (spinner forever, nothing sent; 2026-10-19 to 2026-11-13).
 * Code the browser can load must not use it. Server-only files may, listed here with the reason.
 */
const SERVER_ONLY = new Set([
  "src/lib/blog-content.ts", // only the blog page's server component (post-content.tsx) imports it
]);

const ROOT = join(__dirname, "..", "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("no regex lookbehind in browser code", () => {
  it("finds none outside the API routes and the server-only list", () => {
    const offenders = sourceFiles(join(ROOT, "src"))
      .map((path) => relative(ROOT, path))
      .filter((file) => !file.startsWith("src/app/api/") && !SERVER_ONLY.has(file))
      .filter((file) => /\(\?<[=!]/.test(readFileSync(join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
