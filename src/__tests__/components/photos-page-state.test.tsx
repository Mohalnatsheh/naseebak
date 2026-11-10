import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => ({ country: "JO", profile: { gender: "MALE" } }) }));
vi.mock("@/components/shared/first-visit-tip", () => ({ FirstVisitTip: () => null }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), info: vi.fn(), success: vi.fn() }) }));

import PhotosPage from "@/app/(ar)/dashboard/photos/page";

describe("photos page", () => {
  it("a failed load: LoadError, no «0 من 5», and no upload over an unknown list (QA WM-18)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    render(<PhotosPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText(/من 5/)).toBeNull();
    expect(screen.getByRole("button", { name: /رفع صورة/ })).toBeDisabled();
  });

  it("the counter reads «2 من 5» in RTL (QA DS-10)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ photos: [{ id: "a", url: "/a.webp", isPrimary: true, order: 0 }, { id: "b", url: "/b.webp", isPrimary: false, order: 1 }] }),
    } as Response);
    render(<PhotosPage />);
    expect(await screen.findByText("2 من 5")).toBeTruthy();
  });
});
