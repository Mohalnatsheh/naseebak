import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn() }));

import { IntroError, NO_CREDITS_NEUTRAL_MESSAGE, noCreditsError } from "@/lib/intro/errors";
import { notifyCreditsExhausted, notifyInterestCreditsExhausted, notifyRequestCreditsExhausted } from "@/lib/credits";

// The store review login: a test account never sees payments in the app, so no «اشحن» / «شحن» reaches it
const TEST = "962770970971";
const REAL = "962791234567";
const RECHARGE = /شحن/;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  process.env.EXTRA_TEST_PHONES = TEST;
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    phone: where.id === "test" ? TEST : REAL,
  }));
});

afterEach(() => {
  delete process.env.EXTRA_TEST_PHONES;
  vi.unstubAllEnvs();
});

describe("NO_CREDITS wording", () => {
  it("a test account gets the neutral message, everyone else the website one", () => {
    const test = noCreditsError(TEST);
    expect(test).toBeInstanceOf(IntroError);
    expect(test.code).toBe("NO_CREDITS");
    expect(test.status).toBe(402);
    expect(test.message).toBe(NO_CREDITS_NEUTRAL_MESSAGE);
    expect(test.message).not.toMatch(RECHARGE);

    expect(noCreditsError(REAL).message).toBe(new IntroError("NO_CREDITS").message);
    expect(noCreditsError(REAL).message).toMatch(RECHARGE);
    expect(noCreditsError(null).message).toMatch(RECHARGE);
  });
});

describe("credits exhausted notices", () => {
  const cases = [
    ["suggestions", notifyCreditsExhausted],
    ["requests", notifyRequestCreditsExhausted],
    ["interest", notifyInterestCreditsExhausted],
  ] as const;

  for (const [name, send] of cases) {
    it(`${name}: no recharge wording for a test account`, async () => {
      await send("test");
      const arg = notifyMod.notify.mock.calls[0][0];
      expect(arg.type).toBe("PAYMENT");
      expect(`${arg.title} ${arg.body}`).not.toMatch(RECHARGE);
    });

    it(`${name}: website wording (recharge) for a real member`, async () => {
      await send("real");
      expect(notifyMod.notify.mock.calls[0][0].body).toMatch(RECHARGE);
    });
  }
});
