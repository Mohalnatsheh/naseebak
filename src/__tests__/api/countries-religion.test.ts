import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ countrySetting: { findMany: vi.fn() } }));
const sw = vi.hoisted(() => ({ religion: "false" as "true" | "false" | "throw" }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/settings", () => ({
  getSetting: async () => "",
  getCycleFlags: async () => ({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true }),
  getReligionEnabled: vi.fn(async () => {
    if (sw.religion === "throw") throw new Error("settings down");
    return sw.religion === "true";
  }),
}));

import { clearCountrySettingsCache } from "@/lib/countries/settings";
import { GET } from "@/app/api/countries/[code]/route";

const detail = async () => {
  const res = await GET(new Request("http://x"), { params: Promise.resolve({ code: "jo" }) });
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  vi.clearAllMocks();
  clearCountrySettingsCache();
  db.countrySetting.findMany.mockResolvedValue([]);
});

describe("GET /api/countries/[code]: «الديانة» lists", () => {
  it("sends the religion lists while the switch is on", async () => {
    sw.religion = "true";
    const { status, body } = await detail();
    expect(status).toBe(200);
    expect(body.country.options.religion).toEqual(["مسلم", "مسيحي"]);
    expect(body.country.options.prefReligion).toEqual(["نفس ديانتي", "لا مانع"]);
  });

  it("leaves them out while it is off", async () => {
    sw.religion = "false";
    const { status, body } = await detail();
    expect(status).toBe(200);
    expect("religion" in body.country.options).toBe(false);
    expect("prefReligion" in body.country.options).toBe(false);
  });

  it("a failed switch read answers 200 without them (switch off), never 500", async () => {
    sw.religion = "throw";
    const { status, body } = await detail();
    expect(status).toBe(200);
    expect("religion" in body.country.options).toBe(false);
  });
});
