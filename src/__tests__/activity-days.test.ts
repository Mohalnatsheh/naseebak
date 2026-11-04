import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { appSource, webSource } from "@/lib/activity-days";

describe("activity sources", () => {
  it("website by device from the user agent", () => {
    expect(webSource("Mozilla/5.0 (Linux; Android 14; wv) Instagram 350.0")).toBe("WEB_ANDROID");
    expect(webSource("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("WEB_IPHONE");
    expect(webSource("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("WEB_DESKTOP");
    expect(webSource(null)).toBe("WEB_DESKTOP");
  });

  it("app by X-App-Platform or push device platform", () => {
    expect(appSource("android")).toBe("APP_ANDROID");
    expect(appSource(" iOS ")).toBe("APP_IOS");
    expect(appSource(null)).toBe("APP_OTHER");
    expect(appSource("macos")).toBe("APP_OTHER");
  });
});
