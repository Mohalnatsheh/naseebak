import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ active: ["JO"] as string[] }));
vi.mock("@/lib/countries/settings", () => ({ activeCountryCodes: vi.fn(async () => state.active) }));
vi.mock("@/lib/db", () => ({ db: { blogPost: { findMany: vi.fn(async () => []) } } }));
vi.mock("@/lib/engagement/polls", () => ({ pollsEnabled: vi.fn(async () => false), pollCountries: vi.fn(async () => []) }));

import sitemap from "@/app/sitemap";

beforeEach(() => {
  state.active = ["JO"];
});

describe("sitemap and Lebanon", () => {
  it("lists no /lb URL and no ar-LB alternate while Lebanon is off", async () => {
    state.active = ["JO", "SA"];
    const text = JSON.stringify(await sitemap());
    expect(text).not.toContain("/lb");
    expect(text).not.toContain("ar-LB");
    expect(text).toContain("/sa/faq");
  });

  it("lists /lb pages once Lebanon is on", async () => {
    state.active = ["JO", "LB"];
    const text = JSON.stringify(await sitemap());
    expect(text).toContain("https://naseebak.com/lb/faq");
    expect(text).toContain("ar-LB");
    expect(text).not.toContain("ar-SA");
  });
});
