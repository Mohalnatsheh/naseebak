import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const ctx = vi.hoisted(() => ({ useDashboardData: vi.fn() }));
vi.mock("@/contexts/dashboard-context", () => ctx);

import { VerifiedBadge } from "@/components/shared/verified-badge";

const loaded = (introRequests: boolean) => ({
  counts: {
    flags: { introRequests, chat: false, mutualSuggestions: false },
    pendingIntros: 0,
    pendingIntroMatchId: null,
    unreadChats: 0,
    hasChats: false,
    guardian: null,
  },
});

beforeEach(() => vi.clearAllMocks());

describe("VerifiedBadge", () => {
  it("shows for a verified user when the new cycle is off", () => {
    ctx.useDashboardData.mockReturnValue(loaded(false));
    render(<VerifiedBadge verified />);
    expect(screen.getByText("موثّق")).toBeInTheDocument();
  });

  it("is hidden when the new cycle is on", () => {
    ctx.useDashboardData.mockReturnValue(loaded(true));
    const { container } = render(<VerifiedBadge verified />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is hidden until the counts have loaded (and outside the dashboard provider)", () => {
    ctx.useDashboardData.mockReturnValue({
      counts: { flags: { introRequests: false, chat: false, mutualSuggestions: false }, pendingIntros: 0, unreadChats: 0, hasChats: false, guardian: null },
    });
    const { container } = render(<VerifiedBadge verified />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for unverified users", () => {
    ctx.useDashboardData.mockReturnValue(loaded(false));
    const { container } = render(<VerifiedBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
