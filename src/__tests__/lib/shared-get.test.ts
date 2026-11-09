import { describe, it, expect, vi } from "vitest";
import { sharedGet } from "@/lib/shared-get";

describe("sharedGet (QA WA-10)", () => {
  it("shares one request between callers while it is in flight, each reading its own body", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ user: { id: "u1" } })));
    const [a, b] = await Promise.all([sharedGet("/api/profile"), sharedGet("/api/profile")]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await a.json()).toEqual({ user: { id: "u1" } });
    expect(await b.json()).toEqual({ user: { id: "u1" } });
    spy.mockRestore();
  });

  it("a load after the first finished asks the server again (fresh after a save)", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}"));
    await sharedGet("/api/profile");
    await new Promise((r) => setTimeout(r, 0));
    await sharedGet("/api/profile");
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
