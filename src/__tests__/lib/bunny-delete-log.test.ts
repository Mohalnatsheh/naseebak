import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteFromBunny } from "@/lib/bunny";

const SECRET = "chat/conv1/Zm9vYmFyYmF6cXV4c2VjcmV0cmFuZG9tbmFtZQ.webp";

describe("deleteFromBunny never logs a chat media path", () => {
  beforeEach(() => {
    vi.stubEnv("BUNNY_STORAGE_API_KEY", "k");
    vi.stubEnv("BUNNY_STORAGE_ZONE", "zone");
    vi.stubEnv("BUNNY_STORAGE_ENDPOINT", "storage.test");
    vi.stubEnv("BUNNY_CDN_URL", "https://cdn.test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function logged(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls.flat().map(String).join(" ");
  }

  it("a failed delete says «chat media file», not the path", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await deleteFromBunny(SECRET);
    expect(logged(warn)).toContain("chat media file");
    expect(logged(warn)).not.toContain("Zm9v");
    expect(logged(warn)).not.toContain("conv1");
  });

  it("a network error (whose message may carry the url) logs only its first part", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error(`fetch failed: https://storage.test/zone/${SECRET}`));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await deleteFromBunny(SECRET);
    expect(logged(warn)).toContain("chat media file");
    expect(logged(warn)).not.toContain("Zm9v");
  });

  it("other files (profile photos) keep their path in the log", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await deleteFromBunny("photos/u1/a.webp");
    expect(logged(warn)).toContain("photos/u1/a.webp");
  });
});
