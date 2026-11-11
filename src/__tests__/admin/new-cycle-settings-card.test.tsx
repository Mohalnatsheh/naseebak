import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { NewCycleSettingsCard } from "@/components/admin/new-cycle-settings-card";

const base = {
  introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true,
  activeFirstFeed: true, saRelaxedMatching: true, lbRelaxedMatching: true, freeInterestReply: true, proEnabled: true, chatDeleteEnabled: true, creditsMigratedAt: null,
};
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return { ok: true, json: async () => ({ ...base, ...body }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

const patches = () =>
  fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PATCH").map((c) => JSON.parse(String((c[1] as RequestInit).body)));

describe("NewCycleSettingsCard quick switches", () => {
  for (const [title, key] of [
    ["Free «مهتم» reply", "freeInterestReply"],
    ["Active first, busy last", "activeFirstFeed"],
    ["Saudi Arabia: suggest everyone", "saRelaxedMatching"],
    ["Lebanon: relaxed matching", "lbRelaxedMatching"],
    ["Pro membership sales", "proEnabled"],
    ["Pro: delete messages and clear chats", "chatDeleteEnabled"],
  ] as const) {
    it(`turning «${title}» off saves false at once (no confirmation)`, async () => {
      render(<NewCycleSettingsCard />);
      const sw = await screen.findByRole("switch", { name: title });
      await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
      fireEvent.click(sw);
      await waitFor(() => expect(patches()).toEqual([{ [key]: false }]));
    });
  }

  it("the free reply switch is disabled while credit on interest is off", async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ ...base, creditOnInterest: false }) }));
    render(<NewCycleSettingsCard />);
    const sw = await screen.findByRole("switch", { name: "Free «مهتم» reply" });
    await waitFor(() => expect(sw).toBeDisabled());
    expect(screen.getByText("Turn on credit on interest first.")).toBeInTheDocument();
  });

  it("shows the Pro chat delete switch", async () => {
    render(<NewCycleSettingsCard />);
    const sw = await screen.findByRole("switch", { name: "Pro: delete messages and clear chats" });
    expect(screen.getByText(/Off by default\. Members' existing deletions stay hidden when off\./)).toBeInTheDocument();
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
  });
});
