import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

type Handler = (req: NextRequest & { auth: unknown }) => Promise<Response>;
// NextAuth's wrapper is replaced by one that hands the handler back, so the test passes the session in
vi.mock("next-auth", () => ({ default: () => ({ auth: (h: Handler) => h }) }));

import proxy from "@/proxy";

const call = (url: string, auth: unknown = null) => {
  const req = new NextRequest(url) as NextRequest & { auth: unknown };
  req.auth = auth;
  return (proxy as unknown as Handler)(req);
};

describe("proxy", () => {
  it("?country=sa stores the cookie and redirects to the same URL without it", async () => {
    const res = await call("https://naseebak.com/faq?country=sa&utm_source=ig");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://naseebak.com/faq?utm_source=ig");
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
