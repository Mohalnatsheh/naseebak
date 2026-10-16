import { describe, it, expect } from "vitest";
import { notificationUrl } from "@/lib/notification-links";

describe("notificationUrl", () => {
  it("maps each type to its dashboard page", () => {
    expect(notificationUrl("SUGGESTION")).toBe("/dashboard/suggestions");
    expect(notificationUrl("INTEREST")).toBe("/dashboard/suggestions");
    expect(notificationUrl("MATCH")).toBe("/dashboard/matches");
    expect(notificationUrl("INTRO_REQUEST")).toBe("/dashboard/matches");
    expect(notificationUrl("CHAT")).toBe("/dashboard/chats");
    expect(notificationUrl("SUBSCRIPTION")).toBe("/dashboard/payments");
    expect(notificationUrl("SYSTEM")).toBe("/dashboard");
    expect(notificationUrl("UNKNOWN")).toBe("/dashboard");
  });

  it("prefers a relative url stored in metadata", () => {
    expect(notificationUrl("CHAT", { url: "/dashboard/chats/c1" })).toBe("/dashboard/chats/c1");
  });

  it("ignores absolute or malformed metadata urls", () => {
    expect(notificationUrl("CHAT", { url: "https://evil.example" })).toBe("/dashboard/chats");
    expect(notificationUrl("CHAT", { url: "//evil.example" })).toBe("/dashboard/chats");
    expect(notificationUrl("CHAT", null)).toBe("/dashboard/chats");
  });
});
