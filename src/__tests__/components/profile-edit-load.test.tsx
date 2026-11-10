import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
// One stable value, as the real context gives between updates (a new object per render re-runs the page's effects)
const dash = vi.hoisted(() => ({
  profile: { gender: "MALE" }, country: "JO",
  counts: { flags: { introRequests: true, chat: true, mutualSuggestions: true } },
}));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => dash }));

import ProfileEditPage from "@/app/(ar)/dashboard/profile/edit/page";

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body } as Response);
}
const user = { gender: "MALE", country: "JO", profile: { isComplete: true, city: "عمّان" } };

beforeEach(() => vi.restoreAllMocks());

describe("profile edit never saves after a partial load (QA WA-05)", () => {
  it.each([
    ["the guardian", "/api/profile/parent-info"],
    ["the pending request", "/api/profile/update-request"],
  ])("shows LoadError when %s fails to load", async (_label, failing) => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === failing) return json({ error: "x" }, false);
      if (url === "/api/profile") return json({ user });
      if (url === "/api/profile/update-request") return json({ requests: [] });
      return json({ parentInfo: null });
    });
    render(<ProfileEditPage />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("فلا يمكن التعديل الآن"));
  });
});

describe("guardian step with no guardian yet (QA WA-15)", () => {
  it("says the starred fields are needed only once the guardian is started", async () => {
    window.history.replaceState(null, "", "/dashboard/profile/edit?step=5");
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/profile") return json({ user });
      if (url === "/api/profile/update-request") return json({ requests: [] });
      return json({ parentInfo: null });
    });
    render(<ProfileEditPage />);
    await waitFor(() => expect(screen.getByText(/يمكنك تركه فارغاً الآن/)).toBeTruthy());
    window.history.replaceState(null, "", "/");
  });
});

describe("edit labels follow gender (QA WA-13 review)", () => {
  it("a woman sees feminine skin colours, and city buttons keep the city names", async () => {
    window.history.replaceState(null, "", "/dashboard/profile/edit?step=1");
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/profile") return json({ user: { ...user, gender: "FEMALE" } });
      if (url === "/api/profile/update-request") return json({ requests: [] });
      return json({ parentInfo: null });
    });
    render(<ProfileEditPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "سمراء" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "بيضاء" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "أسمر" })).toBeNull();
    expect(screen.getByRole("button", { name: "عمّان" })).toBeTruthy();
    window.history.replaceState(null, "", "/");
  });
});

describe("each failed check points at its field (QA PA-L9)", () => {
  it("the field gets aria-invalid and aria-describedby to the message; the others stay clean", async () => {
    window.history.replaceState(null, "", "/dashboard/profile/edit?step=1");
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/profile") return json({ user });
      if (url === "/api/profile/update-request") return json({ requests: [] });
      return json({ parentInfo: null });
    });
    const { fireEvent } = await import("@testing-library/react");
    render(<ProfileEditPage />);
    const day = await screen.findByRole("combobox", { name: "اليوم" });
    expect(day.getAttribute("aria-invalid")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /التالي/ }));
    await waitFor(() => expect(day.getAttribute("aria-invalid")).toBe("true"));
    expect(day.getAttribute("aria-describedby")).toBe("profile-edit-error");
    expect(document.getElementById("profile-edit-error")!.textContent).toContain("تاريخ الميلاد");
    // Only the field the message is about
    expect(screen.getByLabelText(/الجنسية/).getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByRole("group", { name: "المدينة" }).getAttribute("aria-invalid")).toBeNull();
    window.history.replaceState(null, "", "/");
  });
});
