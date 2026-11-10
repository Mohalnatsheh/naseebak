import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => ({ country: "JO", profile: { gender: "FEMALE" } }) }));

import SupportPage from "@/app/(ar)/dashboard/support/page";

describe("support «تذاكري» load error (QA WM-01)", () => {
  it("a failed list is a LoadError with a retry, never «لا توجد تذاكر»", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tickets: [], totalPages: 1 }) } as Response);
    render(<SupportPage />);
    fireEvent.click(screen.getByRole("tab", { name: "تذاكري" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("تعذّر تحميل تذاكرك"));
    expect(screen.queryByText("لا توجد تذاكر")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    await waitFor(() => expect(screen.getByText("لا توجد تذاكر")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("the two tabs are a labelled tablist with 44 px tabs (QA WM-03)", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ tickets: [] }) } as Response);
    render(<SupportPage />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    for (const t of tabs) expect(t.className).toContain("min-h-11");
  });
});
