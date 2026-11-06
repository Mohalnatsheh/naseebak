import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { slotMutualWhere } from "@/lib/suggestions/mutual";

describe("slotMutualWhere (G53)", () => {
  it("a card still hidden from the candidate fills the recipient's slot, who sees it, not the candidate's", () => {
    const where = slotMutualWhere("u1") as { OR: Record<string, unknown>[] };
    const asRecipient = where.OR.find((w) => w.recipientId === "u1")!;
    const asCandidate = where.OR.find((w) => w.candidateId === "u1")!;
    expect(asRecipient).not.toHaveProperty("hiddenFromCandidate");
    expect(asCandidate.hiddenFromCandidate).toBe(false);
  });
});
