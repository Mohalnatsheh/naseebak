import { beforeEach, describe, expect, it, vi } from "vitest";

const req = vi.hoisted(() => ({ headers: new Map<string, string>(), cookies: new Map<string, string>(), active: ["JO"] as string[] }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => req.headers.get(k.toLowerCase()) ?? null }),
  cookies: async () => ({ get: (k: string) => (req.cookies.has(k) ? { value: req.cookies.get(k) } : undefined) }),
}));
vi.mock("@/lib/countries/settings", () => ({ activeCountryCodes: vi.fn(async () => req.active) }));

import { getGeoCountry, getVisitorCountry } from "@/lib/countries/server";
import { COUNTRY_COOKIE } from "@/lib/countries";
import { SITE_COUNTRY_HEADER } from "@/lib/site-paths";
import { seoAlternates } from "@/lib/site-paths";

beforeEach(() => {
  req.headers.clear();
  req.cookies.clear();
  req.active = ["JO"];
});

describe("a country switched off in Admin → Countries", () => {
  it("is never the visitor's country: its URL, cookie and location fall back to Jordan", async () => {
    req.headers.set(SITE_COUNTRY_HEADER.toLowerCase(), "SA");
    expect(await getVisitorCountry()).toBe("JO");
    req.headers.clear();
    req.cookies.set(COUNTRY_COOKIE, "SA");
    expect(await getVisitorCountry()).toBe("JO");
    req.cookies.clear();
    req.headers.set("cf-ipcountry", "SA");
    expect(await getVisitorCountry()).toBe("JO");
    expect(await getGeoCountry()).toBeNull(); // so the «هل تريد نسخة السعودية؟» banner never shows
  });

  it("works again as soon as it is switched on", async () => {
    req.active = ["JO", "SA"];
    req.headers.set(SITE_COUNTRY_HEADER.toLowerCase(), "SA");
    expect(await getVisitorCountry()).toBe("SA");
    req.headers.clear();
    req.headers.set("cf-ipcountry", "SA");
    expect(await getGeoCountry()).toBe("SA");
  });

  it("is not advertised to search engines (hreflang)", () => {
    const off = seoAlternates("/faq", "JO", ["JO"]);
    expect(Object.keys(off.languages).sort()).toEqual(["ar-JO", "x-default"]);
    const on = seoAlternates("/faq", "JO", ["JO", "SA"]);
    expect(on.languages["ar-SA"]).toBe("https://naseebak.com/sa/faq");
  });
});
