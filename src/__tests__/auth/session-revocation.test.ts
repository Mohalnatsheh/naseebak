import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

import {
  clearRevocationCache,
  jwtWithRevocation,
  revokeWebSessions,
  sessionStillValid,
} from "@/lib/session-revocation";
import { isBackgroundRequest, withoutSessionCookie } from "@/lib/proxy-session";

beforeEach(() => {
  vi.clearAllMocks();
  clearRevocationCache();
});

describe("session revocation (QA WA-01)", () => {
  it("keeps a session when the member never signed out", async () => {
    db.user.findUnique.mockResolvedValue({ sessionsRevokedAt: null });
    expect(await sessionStillValid({ id: "u1", authAt: 1000 })).toBe(true);
  });

  it("refuses a session signed in before the sign-out, keeps one signed in after", async () => {
    db.user.findUnique.mockResolvedValue({ sessionsRevokedAt: new Date(5000) });
    expect(await sessionStillValid({ id: "u1", authAt: 4000 }, 6000)).toBe(false);
    expect(await sessionStillValid({ id: "u1", authAt: 7000 }, 6000)).toBe(true);
  });

  it("refuses an old token with no sign-in time once the member signs out", async () => {
    db.user.findUnique.mockResolvedValue({ sessionsRevokedAt: new Date(5000) });
    expect(await sessionStillValid({ id: "u1" }, 6000)).toBe(false);
  });

  it("a database failure never signs anyone out", async () => {
    db.user.findUnique.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sessionStillValid({ id: "u1", authAt: 1 })).toBe(true);
  });

  it("sign-out applies at once, without waiting for the cache", async () => {
    db.user.findUnique.mockResolvedValue({ sessionsRevokedAt: null });
    const now = Date.now();
    expect(await sessionStillValid({ id: "u1", authAt: now - 10 }, now)).toBe(true);
    await revokeWebSessions("u1", new Date(now));
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { sessionsRevokedAt: new Date(now) } });
    expect(await sessionStillValid({ id: "u1", authAt: now - 10 }, now + 1)).toBe(false);
    // Read once: the second check came from the cache that sign-out wrote
    expect(db.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it("the jwt callback answers null for a revoked session and stamps the sign-in time on a new one", async () => {
    db.user.findUnique.mockResolvedValue({ sessionsRevokedAt: new Date(Date.now() + 1000) });
    const token = { id: "u1", role: "USER", gender: "MALE", isVerified: false, authAt: 1 };
    expect(await jwtWithRevocation({ token } as never)).toBeNull();
    const fresh = await jwtWithRevocation({
      token: {},
      user: { id: "u2", role: "USER", gender: "FEMALE", isVerified: false },
    } as never);
    expect(fresh?.id).toBe("u2");
    expect(typeof fresh?.authAt).toBe("number");
  });
});

describe("proxy: prefetch never refreshes the session cookie (QA WA-01)", () => {
  it("recognises prefetch and RSC requests", () => {
    expect(isBackgroundRequest(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isBackgroundRequest(new Headers({ rsc: "1" }))).toBe(true);
    expect(isBackgroundRequest(new Headers({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isBackgroundRequest(new Headers({ accept: "text/html" }))).toBe(false);
  });

  it("drops the refreshed session cookie but keeps clearing it and other cookies", () => {
    const res = new Response(null);
    res.headers.append("set-cookie", "authjs.session-token=abc; Path=/; HttpOnly");
    res.headers.append("set-cookie", "__Secure-authjs.session-token.0=def; Path=/");
    res.headers.append("set-cookie", "naseeb_country=SA; Path=/");
    res.headers.append("set-cookie", "authjs.session-token.1=; Max-Age=0; Path=/");
    const out = withoutSessionCookie(res).headers.getSetCookie();
    expect(out).toEqual(["naseeb_country=SA; Path=/", "authjs.session-token.1=; Max-Age=0; Path=/"]);
  });
});
