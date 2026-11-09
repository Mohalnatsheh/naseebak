import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => ({ refreshUnread: vi.fn() }) }));

import { PollCard } from "@/components/engagement/poll-card";

describe("PollCard load failure (QA WA-03)", () => {
  it("says it couldn't load, with a retry, instead of disappearing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    render(<PollCard />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("تعذّر تحميل سؤال نصيبك"));
    expect(screen.getByRole("button", { name: /إعادة المحاولة/ })).toBeTruthy();
  });

  it("renders nothing when no question is running", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({ poll: null }) } as Response);
    const { container } = render(<PollCard />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
});
