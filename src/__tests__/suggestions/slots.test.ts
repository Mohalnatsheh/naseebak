import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { slotMutualWhere } from "@/lib/suggestions/mutual";

describe("slotMutualWhere (G53)", () => {
  it("a card still hidden from the candidate fills neither side's slot", () => {
    const where = slotMutualWhere("u1") as { OR: Record<string, unknown>[] };
    const asRecipient = where.OR.find((w) => w.recipientId === "u1")!;
    const asCandidate = where.OR.find((w) => w.candidateId === "u1")!;
    expect(asRecipient.hiddenFromCandidate).toBe(false);
    expect(asCandidate.hiddenFromCandidate).toBe(false);
  });
});
