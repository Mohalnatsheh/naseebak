import { describe, it, expect } from "vitest";
import {
  buildFunnel,
  effectiveConversationStatus,
  effectiveRequestStatus,
  summarizeIntroRequests,
} from "@/lib/admin/cycle-stats";

const now = new Date("2026-10-16T12:00:00Z");
const past = new Date("2026-10-10T12:00:00Z");
const future = new Date("2026-10-20T12:00:00Z");

describe("effectiveRequestStatus", () => {
  it("treats a pending row past expiry as expired", () => {
    expect(effectiveRequestStatus({ status: "PENDING", expiresAt: past }, now)).toBe("EXPIRED");
  });
  it("keeps a pending row before expiry pending", () => {
    expect(effectiveRequestStatus({ status: "PENDING", expiresAt: future }, now)).toBe("PENDING");
  });
  it("keeps answered rows as they are", () => {
    expect(effectiveRequestStatus({ status: "ACCEPTED", expiresAt: past }, now)).toBe("ACCEPTED");
  });
  it("keeps a pending row without expiry pending", () => {
    expect(effectiveRequestStatus({ status: "PENDING", expiresAt: null }, now)).toBe("PENDING");
  });
  it("accepts ISO strings", () => {
    expect(effectiveRequestStatus({ status: "PENDING", expiresAt: past.toISOString() }, now)).toBe("EXPIRED");
  });
});

describe("effectiveConversationStatus", () => {
  it("treats an active chat past expiry as expired", () => {
    expect(effectiveConversationStatus({ status: "ACTIVE", expiresAt: past }, now)).toBe("EXPIRED");
  });
  it("keeps an active chat active before expiry", () => {
    expect(effectiveConversationStatus({ status: "ACTIVE", expiresAt: future }, now)).toBe("ACTIVE");
  });
  it("keeps an ended chat ended", () => {
    expect(effectiveConversationStatus({ status: "ENDED", expiresAt: past }, now)).toBe("ENDED");
  });
});

describe("summarizeIntroRequests", () => {
  it("counts by type with lazy expiry and a total", () => {
    const s = summarizeIntroRequests(
      [
        { type: "FAMILY", status: "ACCEPTED", expiresAt: past },
        { type: "FAMILY", status: "PENDING", expiresAt: past },
        { type: "FAMILY", status: "PENDING", expiresAt: future },
        { type: "CHAT", status: "DECLINED", expiresAt: future },
        { type: "CHAT", status: "CANCELLED", expiresAt: future },
      ],
      now
    );
    expect(s.FAMILY).toEqual({ sent: 3, pending: 1, accepted: 1, declined: 0, expired: 1, cancelled: 0 });
    expect(s.CHAT).toEqual({ sent: 2, pending: 0, accepted: 0, declined: 1, expired: 0, cancelled: 1 });
    expect(s.ALL).toEqual({ sent: 5, pending: 1, accepted: 1, declined: 1, expired: 1, cancelled: 1 });
  });
});

describe("buildFunnel", () => {
  it("gives each step as a share of registered users", () => {
    const f = buildFunnel({ registered: 200, profileReady: 100, gotSuggestions: 50, matched: 10, introAccepted: 2 });
    expect(f.map((s) => s.label)).toEqual([
      "Registered",
      "Profile ≥ 50%",
      "Got suggestions",
      "Mutual match",
      "Introduction accepted",
    ]);
    expect(f.map((s) => s.pct)).toEqual([100, 50, 25, 5, 1]);
  });
  it("shows 0% (not NaN) with no users", () => {
    const f = buildFunnel({ registered: 0, profileReady: 0, gotSuggestions: 0, matched: 0, introAccepted: 0 });
    expect(f.every((s) => s.pct === 0)).toBe(true);
  });
});
