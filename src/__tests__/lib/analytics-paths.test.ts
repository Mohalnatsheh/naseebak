import { describe, it, expect } from "vitest";
import { analyticsPageLocation, isAnalyticsOffPath, isPrivatePath } from "@/lib/analytics";

describe("isPrivatePath (no GTM / Meta Pixel there)", () => {
  it("covers the dashboard, chats and admin", () => {
    for (const p of ["/dashboard", "/dashboard/chats/c1", "/chat", "/admin/users"]) expect(isPrivatePath(p)).toBe(true);
  });
  it("leaves public pages tracked", () => {
    for (const p of ["/", "/blog/x", "/faq", "/login", "/register", "/dashboards-guide"]) expect(isPrivatePath(p)).toBe(false);
  });
});

describe("isAnalyticsOffPath (no GA4 at all)", () => {
  it("is admin only", () => {
    for (const p of ["/admin", "/admin/users/x"]) expect(isAnalyticsOffPath(p)).toBe(true);
    for (const p of ["/", "/dashboard", "/dashboard/chats/x", "/administration-guide"]) expect(isAnalyticsOffPath(p)).toBe(false);
  });
});

describe("analyticsPageLocation (what GA4 gets as the page URL)", () => {
  const o = "https://naseebak.com";
  it("hides record ids in signed-in URLs", () => {
    expect(analyticsPageLocation(`${o}/dashboard/chats/cmvzs9ojt04dfr48u9waua4e8`)).toBe(`${o}/dashboard/chats/:id`);
    expect(analyticsPageLocation(`${o}/dashboard/chats/550e8400-e29b-41d4-a716-446655440000`)).toBe(`${o}/dashboard/chats/:id`);
  });
  it("keeps only the tab from a signed-in query and drops the hash", () => {
    expect(analyticsPageLocation(`${o}/dashboard/suggestions?tab=matches&match=cmvvl2ul406u07k8umksotxcx#x`)).toBe(`${o}/dashboard/suggestions?tab=matches`);
    expect(analyticsPageLocation(`${o}/dashboard/payments?session_id=cs_live_123`)).toBe(`${o}/dashboard/payments`);
  });
  it("keeps page names", () => {
    expect(analyticsPageLocation(`${o}/dashboard/profile/setup`)).toBe(`${o}/dashboard/profile/setup`);
    expect(analyticsPageLocation(`${o}/dashboard/personality-quiz`)).toBe(`${o}/dashboard/personality-quiz`);
  });
  it("leaves public URLs alone (utm tags stay)", () => {
    const u = `${o}/?utm_source=ig&utm_medium=social`;
    expect(analyticsPageLocation(u)).toBe(u);
    expect(analyticsPageLocation(`${o}/blog/marahel-alzawaj-fi-alordon`)).toBe(`${o}/blog/marahel-alzawaj-fi-alordon`);
  });
  it("drops the login page's callbackUrl (it holds the dashboard link and its ids)", () => {
    expect(analyticsPageLocation(`${o}/login?callbackUrl=https%3A%2F%2Fnaseebak.com%2Fdashboard%2Fchats%2Fcmvzs9ojt04dfr48u9waua4e8`)).toBe(`${o}/login`);
    expect(analyticsPageLocation(`${o}/login?callbackUrl=%2Fdashboard&utm_source=ig`)).toBe(`${o}/login?utm_source=ig`);
  });
  it("passes through empty and other sites' referrers", () => {
    expect(analyticsPageLocation("")).toBe("");
    expect(analyticsPageLocation("https://l.instagram.com/")).toBe("https://l.instagram.com/");
  });
});
