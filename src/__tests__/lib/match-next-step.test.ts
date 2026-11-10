import { describe, it, expect } from "vitest";
import { matchNextStep, type NextStepFacts } from "@/lib/matches/next-step";

const now = new Date("2026-11-10T10:00:00Z");
const later = new Date("2026-11-15T10:00:00Z");
const past = new Date("2026-11-01T10:00:00Z");
const base: NextStepFacts = { viewerId: "me", closed: null, actionable: false, requests: [], conversation: null };

describe("matchNextStep", () => {
  it("a request from the partner waits for my answer first", () => {
    expect(matchNextStep({ ...base, requests: [{ type: "FAMILY", status: "PENDING", expiresAt: later, senderId: "p" }] }, now)).toBe("reply_family");
    expect(
      matchNextStep({
        ...base,
        conversation: { status: "ACTIVE", expiresAt: later },
        requests: [{ type: "CHAT", status: "PENDING", expiresAt: later, senderId: "p" }],
      }, now),
    ).toBe("reply_chat");
  });

  it("an open chat, then an accepted family introduction", () => {
    expect(matchNextStep({ ...base, conversation: { status: "ACTIVE", expiresAt: later } }, now)).toBe("chat_open");
    expect(matchNextStep({ ...base, conversation: { status: "ACTIVE", expiresAt: past } }, now)).toBeNull();
    expect(matchNextStep({ ...base, requests: [{ type: "FAMILY", status: "ACCEPTED", expiresAt: past, senderId: "p" }] }, now)).toBe("family_accepted");
  });

  it("my own pending request waits for the partner; an expired one doesn't count", () => {
    expect(matchNextStep({ ...base, requests: [{ type: "FAMILY", status: "PENDING", expiresAt: later, senderId: "me" }] }, now)).toBe("waiting_family");
    expect(matchNextStep({ ...base, requests: [{ type: "CHAT", status: "PENDING", expiresAt: past, senderId: "me" }] }, now)).toBeNull();
  });

  it("nothing under way: choose when actionable; closed: nothing", () => {
    expect(matchNextStep({ ...base, actionable: true }, now)).toBe("choose");
    expect(matchNextStep({ ...base, closed: "blocked", actionable: true }, now)).toBeNull();
  });
});
