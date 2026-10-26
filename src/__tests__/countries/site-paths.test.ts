import { describe, it, expect } from "vitest";
import { localizedPath, seoAlternates, splitCountryPath, switchCountryPath, absoluteUrl } from "@/lib/site-paths";

describe("country URLs", () => {
  it("prefixes only pages that exist per country", () => {
    expect(localizedPath("/faq", "SA")).toBe("/sa/faq");
    expect(localizedPath("/", "SA")).toBe("/sa");
    expect(localizedPath("/#how-it-works", "SA")).toBe("/sa#how-it-works");
    expect(localizedPath("/faq?x=1", "SA")).toBe("/sa/faq?x=1");
    expect(localizedPath("/register", "SA")).toBe("/register");
    expect(localizedPath("/dashboard", "SA")).toBe("/dashboard");
    expect(localizedPath("https://x.com/faq", "SA")).toBe("https://x.com/faq");
    expect(localizedPath("/sa/faq", "JO")).toBe("/faq");
    expect(localizedPath("/faq", "JO")).toBe("/faq");
  });

  it("splits and switches", () => {
    expect(splitCountryPath("/sa/about")).toEqual({ country: "SA", path: "/about" });
    expect(splitCountryPath("/sa")).toEqual({ country: "SA", path: "/" });
    expect(splitCountryPath("/sales")).toEqual({ country: null, path: "/sales" });
    expect(switchCountryPath("/sa/privacy", "JO")).toBe("/privacy");
    expect(switchCountryPath("/privacy", "SA")).toBe("/sa/privacy");
    expect(switchCountryPath("/login", "SA")).toBeNull();
  });

  it("declares every country version (hreflang) with its own canonical", () => {
    expect(seoAlternates("/faq", "SA")).toEqual({
      canonical: "https://naseebak.com/sa/faq",
      languages: { "ar-JO": "https://naseebak.com/faq", "ar-SA": "https://naseebak.com/sa/faq", "x-default": "https://naseebak.com/faq" },
    });
    expect(absoluteUrl("/", "JO")).toBe("https://naseebak.com");
    expect(absoluteUrl("/", "SA")).toBe("https://naseebak.com/sa");
  });
});
