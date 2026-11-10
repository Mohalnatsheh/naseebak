import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

/* Review X4b minor 3: the notifications sheet answers openPushSetup() on home while home is loading or failed */

vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({ profile: null, completeness: null, counts: { flags: {} }, loading: true }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/components/shared/push-setup", () => ({
  usePushState: () => ({ stage: "allow" }),
  PushSetupSheet: ({ open }: { open: boolean }) => (open ? <div>push-sheet-open</div> : null),
}));

describe("PushSetupHost", () => {
  it("is mounted by the dashboard column on home, whatever home renders", async () => {
    const { DashboardColumn } = await import("@/components/shared/banner-slot");
    const { openPushSetup } = await import("@/components/shared/notification-bar");
    // Home places the banner slot itself, and while loading it renders only its skeleton
    render(<DashboardColumn><div role="status">loading</div></DashboardColumn>);
    expect(screen.queryByText("push-sheet-open")).toBeNull();
    act(() => openPushSetup());
    expect(screen.getByText("push-sheet-open")).toBeInTheDocument();
  });
});
