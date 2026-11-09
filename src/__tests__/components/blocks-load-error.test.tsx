import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => ({ country: "JO" }) }));

import BlocksPage from "@/app/(ar)/dashboard/blocks/page";

describe("blocks page load error (QA WA-19)", () => {
  it("shows a fixed message with a retry, never the server's text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "Prisma P2024 timeout" }) } as Response);
    render(<BlocksPage />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("تعذّر تحميل قائمة المحظورين"));
    expect(screen.queryByText(/Prisma/)).toBeNull();
  });
});
