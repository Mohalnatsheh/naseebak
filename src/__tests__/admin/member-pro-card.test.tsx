import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { MemberProCard } from "@/components/admin/member-pro-card";
import { ProPlansEditor, proPlansFromDrafts, toDrafts } from "@/components/admin/pro-plans-editor";

const sub = (over: Record<string, unknown> = {}) => ({
  id: "ps1", plan: "MONTHLY", status: "ACTIVE", country: "JO", price: "4", currency: "JOD", creditsPerGrant: 8,
  currentPeriodEnd: "2026-12-09T10:00:00.000Z", cancelAtPeriodEnd: false, endedAt: null, createdAt: "2026-11-09T10:00:00.000Z",
  stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1", ...over,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MemberProCard (admin): cancel now", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    let ended = false;
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        ended = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ isPro: !ended, subscriptions: [sub(ended ? { status: "ENDED", endedAt: "2026-11-10T10:00:00.000Z" } : {})] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("asks first; «Keep Pro» sends nothing", async () => {
    render(<MemberProCard userId="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel now" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/no refund/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep Pro" }));
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("confirming posts cancel_now for that membership, then shows it ended", async () => {
    render(<MemberProCard userId="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel now" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel now" }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST")!;
    expect(post[0]).toBe("/api/admin/users/u1/pro");
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ action: "cancel_now", subscriptionId: "ps1" });
    expect(await screen.findByText("Ended")).toBeTruthy(); // a word, not the enum (ADM-18)
    expect(screen.queryByRole("button", { name: "Cancel now" })).toBeNull();
  });

  it("a refused cancel shows the server's error", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ error: "Membership already ended" }), { status: 409 })
        : new Response(JSON.stringify({ isPro: true, subscriptions: [sub()] }), { status: 200 })
    );
    render(<MemberProCard userId="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel now" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel now" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Membership already ended"));
  });
});

describe("ProPlansEditor: what goes to the server", () => {
  it("maps drafts to plans: a blank switched-off plan is dropped, blank credits are 0, the rest goes as typed", () => {
    expect(
      proPlansFromDrafts({
        weekly: { enabled: false, price: "", credits: "" },
        monthly: { enabled: true, price: "4.5", credits: "" },
        yearly: { enabled: false, price: "40", credits: "10" },
      })
    ).toEqual({ monthly: { enabled: true, price: 4.5, credits: 0 }, yearly: { enabled: false, price: 40, credits: 10 } });
    expect(proPlansFromDrafts(toDrafts(null))).toBeNull();
    // A bad value still goes, so the server names it
    expect(proPlansFromDrafts({ ...toDrafts(null), weekly: { enabled: true, price: "", credits: "2" } })).toEqual({ weekly: { enabled: true, price: 0, credits: 2 } });
  });

  it("typing sends the mapped plans; a value changed from outside resets the fields", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ProPlansEditor code="JO" country="Jordan" currency="JOD" value={{ monthly: { enabled: true, price: 4, credits: 8 } }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Price (JOD)", { selector: "#pro-JO-monthly-price" }), { target: { value: "5" } });
    expect(onChange).toHaveBeenLastCalledWith({ monthly: { enabled: true, price: 5, credits: 8 } });
    // The page reloads the saved settings (a different value): the fields follow
    rerender(<ProPlansEditor code="JO" country="Jordan" currency="JOD" value={{ monthly: { enabled: true, price: 6, credits: 2 } }} onChange={onChange} />);
    expect((screen.getByLabelText("Price (JOD)", { selector: "#pro-JO-monthly-price" }) as HTMLInputElement).value).toBe("6");
    expect((document.getElementById("pro-JO-monthly-credits") as HTMLInputElement).value).toBe("2");
  });

  it("names a bad plan inline before any confirmation, with ids from the country code (QA WEB-PAY-10)", async () => {
    const { proPlansError } = await import("@/lib/validations/country-settings");
    expect(proPlansError({ weekly: { enabled: false, price: -5, credits: 2 } }, "SA")).toBe("Weekly: A Pro plan price must be above 0");
    expect(proPlansError({ monthly: { enabled: true, price: 4, credits: 2.5 } }, "JO")).toBe("Monthly: Pro credits must be a whole number");
    expect(proPlansError({ monthly: { enabled: true, price: 1, credits: 2 } }, "SA")).toBe("A Saudi Pro plan price must be at least 2 SAR");
    expect(proPlansError({ monthly: { enabled: true, price: 4, credits: 8 } }, "JO")).toBeNull();
    // Every bad field, not only the first (WP2-13)
    expect(
      proPlansError({ weekly: { enabled: true, price: 0, credits: 2 }, yearly: { enabled: true, price: 5, credits: 200 } }, "JO"),
    ).toBe("Weekly: A Pro plan price must be above 0 · Yearly: Pro credits are at most 100");
    expect(
      proPlansError({ weekly: { enabled: true, price: 1, credits: 2 }, monthly: { enabled: true, price: 1.5, credits: 2 } }, "SA"),
    ).toBe("A Saudi Pro plan price must be at least 2 SAR (Weekly, Monthly)");
    render(<ProPlansEditor code="SA" country="Saudi Arabia" currency="SAR" value={null} onChange={vi.fn()} error="Weekly: A Pro plan price must be above 0" />);
    expect(screen.getByRole("alert").textContent).toContain("Weekly");
    expect(document.getElementById("pro-SA-weekly-price")).toBeTruthy();
  });
});

describe("MemberProCard (admin): grants (QA WP2-18)", () => {
  it("shows grants made and the next grant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ isPro: true, subscriptions: [sub({ grantsMade: 3, creditsGranted: 24, nextGrantAt: "2026-12-09T10:00:00.000Z" })] }), { status: 200 }))
    );
    render(<MemberProCard userId="u1" />);
    const line = await screen.findByTestId("pro-grants");
    expect(line.textContent).toContain("Grants made: 3 (24 credits)");
    expect(line.textContent).toContain("Next grant");
    expect(line.textContent).toContain("(8 credits)");
  });

  it("no next grant once the renewal is off", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ isPro: true, subscriptions: [sub({ grantsMade: 1, creditsGranted: 8, nextGrantAt: null, cancelAtPeriodEnd: true })] }), { status: 200 })));
    render(<MemberProCard userId="u1" />);
    expect((await screen.findByTestId("pro-grants")).textContent).toContain("No next grant");
  });
});
