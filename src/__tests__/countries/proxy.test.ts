import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

type Handler = (req: NextRequest & { auth: unknown }) => Promise<Response>;
// NextAuth's wrapper is replaced by one that hands the handler back, so the test passes the session in
vi.mock("next-auth", () => ({ default: () => ({ auth: (h: Handler) => h }) }));

import proxy from "@/proxy";
import nextConfig from "../../../next.config";
import { LOCALIZED_PATHS, localizedPath } from "@/lib/site-paths";

const call = (url: string, auth: unknown = null) => {
  const req = new NextRequest(url) as NextRequest & { auth: unknown };
  req.auth = auth;
  return (proxy as unknown as Handler)(req);
};

describe("proxy", () => {
  it("?country=sa on a localized page stores the cookie and redirects to its Saudi URL", async () => {
    const res = await call("https://naseebak.com/faq?country=sa&utm_source=ig");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://naseebak.com/sa/faq?utm_source=ig");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("naseeb_country=SA");
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });

  it("still sends signed-out visitors from /dashboard to /login", async () => {
    const res = await call("https://naseebak.com/dashboard/matches");
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("callbackUrl")).toBe("https://naseebak.com/dashboard/matches");
  });

  it("lets signed-in members and public pages through", async () => {
    const member = { user: { id: "u1", role: "USER" } };
    expect((await call("https://naseebak.com/dashboard", member)).headers.get("location")).toBeNull();
    expect((await call("https://naseebak.com/faq")).headers.get("location")).toBeNull();
  });

  it("keeps the other auth redirects", async () => {
    const res = await call("https://naseebak.com/admin/users");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/admin/login");
    const signedIn = await call("https://naseebak.com/login", { user: { id: "u1", role: "USER" } });
    expect(new URL(signedIn.headers.get("location")!).pathname).toBe("/dashboard");
  });
});

describe("country URLs (SEO)", () => {
  it("next.config routes every Saudi URL to its page, and nothing else", async () => {
    const rewrites = await nextConfig.rewrites!();
    const list = (Array.isArray(rewrites) ? rewrites : rewrites.beforeFiles) ?? [];
    expect(list.map((r) => r.source).sort()).toEqual([...LOCALIZED_PATHS.map((p) => localizedPath(p, "SA")), "/sa/blog/:slug", "/sa/poll/:slug"].sort());
    for (const r of list) expect(`/sa${r.destination === "/" ? "" : r.destination}`).toBe(r.source);
  });

  // A rewrite from the proxy carries the public host, which Next treats as another site behind Nginx: it fetched
  // naseebak.com/ and the page came back as Jordan. next.config.ts routes these paths instead.
  it("/sa/faq passes on with the site-country header, for next.config to route (and remembers the choice)", async () => {
    const res = await call("https://naseebak.com/sa/faq?x=1");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-site-country")).toBe("SA");
    expect(res.headers.get("set-cookie") ?? "").toContain("naseeb_country=SA");
  });

  it("?country= on a post or question goes to the other country's list, not a 404", async () => {
    expect((await call("https://naseebak.com/blog/x?country=sa")).headers.get("location")).toBe("https://naseebak.com/sa/blog");
    expect((await call("https://naseebak.com/sa/poll/x?country=jo")).headers.get("location")).toBe("https://naseebak.com/poll");
    expect((await call("https://naseebak.com/blog/x?country=jo")).headers.get("location")).toBe("https://naseebak.com/blog/x");
  });

  it("the blog has country URLs too", async () => {
    expect((await call("https://naseebak.com/sa/blog/x")).headers.get("x-middleware-request-x-site-country")).toBe("SA");
    expect((await call("https://naseebak.com/blog/x")).headers.get("x-middleware-request-x-site-country")).toBe("JO");
  });

  it("renders /sa as the Saudi home page", async () => {
    const res = await call("https://naseebak.com/sa");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("Jordan's pages stay at the root and are marked JO, whatever the cookie says", async () => {
    const res = await call("https://naseebak.com/about");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-site-country")).toBe("JO");
  });

  it("/sa/register (no country URL) redirects to /register and remembers Saudi Arabia", async () => {
    const res = await call("https://naseebak.com/sa/register");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/register");
    expect(res.headers.get("set-cookie") ?? "").toContain("naseeb_country=SA");
  });

  it("?country=jo on a Saudi page goes back to the root URL", async () => {
    const res = await call("https://naseebak.com/sa/terms?country=jo");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/terms");
  });

  it("/sales is not a Saudi URL", async () => {
    const res = await call("https://naseebak.com/sales");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
