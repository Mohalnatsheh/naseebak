import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const ctx = vi.hoisted(() => ({ refreshProfile: vi.fn(async () => {}) }));
// Stable like the real hook's useCallback functions
const autoSave = vi.hoisted(() => ({
  savedIndicatorVisible: false,
  saveToServer: vi.fn(),
  saveToLocalStorage: vi.fn(),
  restoreDraft: () => null,
  clearDraft: vi.fn(),
}));
const settings = vi.hoisted(() => ({ redesign: false, introRequests: true }));

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/dashboard/profile/setup" }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({ refreshProfile: ctx.refreshProfile, profile: { phone: "+962777000001" }, country: "JO" }),
}));
vi.mock("@/hooks/use-auto-save", () => ({ useAutoSave: () => autoSave }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/settings", () => ({
  getAuthRedesignEnabled: async () => settings.redesign,
  getCycleFlags: async () => ({ introRequests: settings.introRequests }),
}));
vi.mock("@/app/(ar)/dashboard/profile/setup/legacy-setup-page", () => ({ default: () => <div data-testid="legacy-setup" /> }));

import { ShortSetup } from "@/components/profile/setup/short-setup";
import { editField } from "@/lib/profile-edit-fields";

type Profile = Record<string, unknown>;

const FULL_STEP_1_2: Profile = {
  dateOfBirth: "1995-03-14T00:00:00.000Z",
  nationality: "أردني",
  city: "عمّان",
  education: "بكالوريوس",
  maritalStatus: "أعزب/عزباء",
  childrenCount: 0,
  religiosity: "ملتزم",
};

let fetchSpy: MockInstance<typeof fetch>;

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body, clone() { return this; } } as unknown as Response);
}

function mockProfile(profile: Profile | null, { country = "JO", gender = "MALE" } = {}) {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    if (url === "/api/profile" && !init?.method) {
      return json({ user: { id: "u1", gender, country, profile: profile ? { ...profile, setupStep: 3, isComplete: false } : null } });
    }
    if (url === "/api/profile" && init?.method === "PUT") return json({ success: true });
    return json({});
  });
}

const next = () => fireEvent.click(screen.getByRole("button", { name: /التالي/ }));

beforeEach(() => {
  vi.restoreAllMocks();
  router.push.mockClear();
  ctx.refreshProfile.mockClear();
  autoSave.saveToServer.mockClear();
  autoSave.clearDraft.mockClear();
  settings.redesign = false;
  settings.introRequests = true;
});

describe("ShortSetup (auth_profile_redesign)", () => {
  it("starts at step 3 when only prefAge is missing (old setupStep=3)", async () => {
    mockProfile(FULL_STEP_1_2);
    render(<ShortSetup guardianStep={false} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "من تبحث عنه؟" })).toBeTruthy());
    expect(screen.getByLabelText("العمر الأدنى")).toBeTruthy();
    // The named step bar
    expect(screen.getByText("1. عنك")).toBeTruthy();
    expect(screen.getByText("2. حالتك")).toBeTruthy();
    expect(screen.getByText("3. من تبحث عنه")).toBeTruthy();
  });

  it("step 3 heading follows the viewer's gender", async () => {
    mockProfile({ ...FULL_STEP_1_2 }, { gender: "FEMALE" });
    render(<ShortSetup guardianStep={false} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "من تبحثين عنه؟" })).toBeTruthy());
  });

  it("step 2 hides childrenCount for single and shows sect only for LB", async () => {
    mockProfile({ ...FULL_STEP_1_2, maritalStatus: "", religiosity: "" }, { country: "JO" });
    const { unmount } = render(<ShortSetup guardianStep={false} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "حالتك الاجتماعية" })).toBeTruthy());
    expect(screen.queryByText("المذهب")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "أعزب" }));
    expect(screen.queryByLabelText("عدد الأبناء")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "مطلق" }));
    expect(screen.getByLabelText("عدد الأبناء")).toBeTruthy();
    unmount();

    vi.restoreAllMocks();
    mockProfile({ ...FULL_STEP_1_2, maritalStatus: "", religiosity: "" }, { country: "LB" });
    render(<ShortSetup guardianStep={false} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "حالتك الاجتماعية" })).toBeTruthy());
    expect(screen.getByText("المذهب")).toBeTruthy();
    // «أفضّل عدم الذكر» is a valid answer
    expect(screen.getByRole("button", { name: "أفضّل عدم الذكر" })).toBeTruthy();
  });

  it("next shows errors under empty required fields and stays", async () => {
    mockProfile(null);
    render(<ShortSetup guardianStep={false} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "معلوماتك الأساسية" })).toBeTruthy());
    act(() => next());
    expect(screen.getByText("تاريخ الميلاد مطلوب")).toBeTruthy();
    expect(screen.getByText("المدينة مطلوبة")).toBeTruthy();
    expect(screen.getByText("المستوى التعليمي مطلوب")).toBeTruthy();
    // Nationality starts with the country's default, so it has no error
    expect(screen.queryByText("الجنسية مطلوبة")).toBeNull();
    expect(screen.getByRole("heading", { name: "معلوماتك الأساسية" })).toBeTruthy();
    expect(autoSave.saveToServer).not.toHaveBeenCalled();
  });

  it("step 2 «التالي» with a single member sends childrenCount 0 in the draft and moves on", async () => {
    mockProfile({ ...FULL_STEP_1_2, maritalStatus: "", religiosity: "", childrenCount: null });
    render(<ShortSetup guardianStep={false} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "حالتك الاجتماعية" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "مطلق" }));
    act(() => next());
    expect(screen.getByText("عدد الأبناء مطلوب")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "أعزب" }));
    fireEvent.click(screen.getByRole("button", { name: "ملتزم" }));
    act(() => next());
    expect(autoSave.saveToServer).toHaveBeenCalledWith(3, expect.objectContaining({ maritalStatus: "أعزب/عزباء", childrenCount: 0, religiosity: "ملتزم" }));
    expect(screen.getByRole("heading", { name: "من تبحث عنه؟" })).toBeTruthy();
  });

  it("prefAgeMin > prefAgeMax shows the age error", async () => {
    mockProfile(FULL_STEP_1_2);
    render(<ShortSetup guardianStep={false} />);
    await waitFor(() => expect(screen.getByLabelText("العمر الأدنى")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("العمر الأدنى"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("العمر الأقصى"), { target: { value: "30" } });
    act(() => fireEvent.click(screen.getByRole("button", { name: /حفظ والبدء/ })));
    expect(screen.getByText("العمر الأدنى يجب أن يكون أقل من العمر الأقصى")).toBeTruthy();
    expect(fetchSpy.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "PUT")).toBe(false);
  });

  it("finish PUTs the profile and shows «ملفك جاهز» with «عرض الاقتراحات» to /dashboard/suggestions", async () => {
    mockProfile(FULL_STEP_1_2);
    render(<ShortSetup guardianStep={false} />);
    await waitFor(() => expect(screen.getByLabelText("العمر الأدنى")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("العمر الأدنى"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("العمر الأقصى"), { target: { value: "35" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /حفظ والبدء/ })));
    await waitFor(() => expect(screen.getByRole("heading", { name: "ملفك جاهز" })).toBeTruthy());

    const put = fetchSpy.mock.calls.find((c) => String(c[0]) === "/api/profile" && (c[1] as RequestInit)?.method === "PUT")!;
    const body = JSON.parse(String((put[1] as RequestInit).body));
    expect(body).toMatchObject({
      dateOfBirth: "1995-03-14",
      nationality: "أردني",
      city: "عمّان",
      education: "بكالوريوس",
      maritalStatus: "أعزب/عزباء",
      childrenCount: 0,
      religiosity: "ملتزم",
      prefAgeMin: 25,
      prefAgeMax: 35,
    });
    expect(body.sect).toBeUndefined();
    expect(fetchSpy.mock.calls.some((c) => String(c[0]) === "/api/profile/parent-info")).toBe(false);
    expect(ctx.refreshProfile).toHaveBeenCalled();
    expect(autoSave.clearDraft).toHaveBeenCalled();

    expect(screen.getByRole("link", { name: "عرض الاقتراحات" }).getAttribute("href")).toBe("/dashboard/suggestions");
    expect(screen.getByText("أكمل ملفك متى شئت · يزيد فرصك")).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/dashboard/profile/edit?field=aboutMe",
        "/dashboard/profile/edit?field=job",
        "/dashboard/photos",
        "/dashboard/profile/edit?field=prefAgeMin",
      ]),
    );
    // The edit links point at real rows of the edit list
    for (const key of ["aboutMe", "job", "prefAgeMin"]) expect(editField(key)?.key).toBe(key);
  });

  it("legacy cycle: a fourth guardian step saves the guardian before the profile", async () => {
    mockProfile(FULL_STEP_1_2);
    render(<ShortSetup guardianStep />);
    await waitFor(() => expect(screen.getByLabelText("العمر الأدنى")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("العمر الأدنى"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("العمر الأقصى"), { target: { value: "35" } });
    act(() => next());
    expect(screen.getByRole("heading", { name: "بيانات ولي الأمر" })).toBeTruthy();
    expect(autoSave.saveToServer).toHaveBeenCalledWith(5, expect.objectContaining({ prefAgeMin: 25 }));
    act(() => fireEvent.click(screen.getByRole("button", { name: /حفظ والبدء/ })));
    expect(screen.getByText("اسم ولي الأمر مطلوب")).toBeTruthy();
  });

  it("a failed profile load shows a retry and never the form", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => json({ error: "x" }, false));
    render(<ShortSetup guardianStep={false} />);
    await waitFor(() => expect(screen.getByText(/تعذّر تحميل ملفك/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /التالي/ })).toBeNull();
  });
});

describe("/dashboard/profile/setup follows auth_profile_redesign", () => {
  it("wrapper renders legacy setup when the switch is off", async () => {
    const { default: SetupPage } = await import("@/app/(ar)/dashboard/profile/setup/page");
    render(await SetupPage());
    expect(screen.getByTestId("legacy-setup")).toBeTruthy();
  });

  it("wrapper renders the short setup when the switch is on", async () => {
    settings.redesign = true;
    mockProfile(FULL_STEP_1_2);
    const { default: SetupPage } = await import("@/app/(ar)/dashboard/profile/setup/page");
    render(await SetupPage());
    expect(screen.queryByTestId("legacy-setup")).toBeNull();
    await waitFor(() => expect(screen.getByText("1. عنك")).toBeTruthy());
  });
});
