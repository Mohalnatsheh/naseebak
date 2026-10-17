import { describe, it, expect } from "vitest";
import { describeMatch, type MatchFacts } from "@/lib/matches/state";

const future = new Date(Date.now() + 86400000);
const base: MatchFacts = {
  requests: [{ type: "FAMILY", status: "ACCEPTED", expiresAt: future }],
  conversation: null,
  partnerUnavailable: false,
  blockedByMe: false,
  chatEnabled: true,
  introEnabled: true,
};

describe("describeMatch with follow-up answers", () => {
  it("«لم يحصل نصيب» from either side closes the match as ended", () => {
    expect(describeMatch({ ...base, outcomes: { mine: null, partner: "NOT_A_MATCH" } }).closed).toBe("ended");
    expect(describeMatch({ ...base, outcomes: { mine: "NOT_A_MATCH", partner: null } }).closed).toBe("ended");
  });
  it("my «تمت الخطبة» closes it as engaged; the partner's alone does not", () => {
    expect(describeMatch({ ...base, outcomes: { mine: "ENGAGED", partner: null } }).closed).toBe("engaged");
    expect(describeMatch({ ...base, outcomes: { mine: null, partner: "ENGAGED" } }).closed).toBeNull();
    expect(describeMatch({ ...base, outcomes: { mine: "CONTINUING", partner: null } }).closed).toBeNull();
  });
});
