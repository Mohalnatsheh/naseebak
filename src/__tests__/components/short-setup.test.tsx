import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const ctx = vi.hoisted(() => ({ refreshProfile: vi.fn(async () => {}), religionEnabled: false, mutual: true, countsMissing: false }));
const localDraft = vi.hoisted(() => ({ value: null as null | { savedAt: string; form: Record<string, unknown> } }));
// Stable like the real hook's useCallback functions
const autoSave = vi.hoisted(() => ({
  savedIndicatorVisible: false,
  saveToServer: vi.fn(),
  saveToLocalStorage: vi.fn(),
  restoreDraft: () => localDraft.value,
  clearDraft: vi.fn(),
}));
const settings = vi.hoisted(() => ({ redesign: false, introRequests: true }));

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/dashboard/profile/setup" }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    refreshProfile: ctx.refreshProfile,
    profile: { phone: "+962777000001" },
    country: "JO",
    loading: false,
    counts: ctx.countsMissing ? undefined : { religionEnabled: ctx.religionEnabled, flags: { mutualSuggestions: ctx.mutual } },
  }),
}));
vi.mock("@/hooks/use-auto-save", () => ({ useAutoSave: () => autoSave }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/settings", () => ({
  getAuthRedesignEnabled: async () => settings.redesign,
  getCycleFlags: async () => ({ introRequests: settings.introRequests }),
}));
vi.mock("@/app/(ar)/dashboard/profile/setup/legacy-setup-page", () => ({ default: () => <div data-testid="legacy-setup" /> }));

import { ShortSetup } from "@/components/profile/setup/short-setup";
import { SetupDone } from "@/components/profile/setup/setup-done";
import { editField } from "@/lib/profile-edit-fields";
import { MUSLIM_ONLY_FIELDS } from "@/lib/profile-religion";

type Profile = Record<string, unknown>;

/** «عنك» answered (a single Jordanian man) */
const STEP_YOU: Profile = {
  dateOfBirth: "1995-03-14T00:00:00.000Z",
  nationality: "أردني",
  city: "عمّان",
  maritalStatus: "أعزب/عزباء",
  childrenCount: 0,
  skinColor: "حنطي",
};
const STEP_FAITH: Profile = {
  religiosity: "ملتزم",
  beard: true,
  smokingStatus: "لا أدخن",
  cookingAbility: "أطبخ قليلاً",
  lifestyle: "هادئ",
  drivingLicense: true,
  willingToRelocate: "yes",
};
const STEP_WORK: Profile = { education: "بكالوريوس", job: "مهندس", incomeRange: "500-1000 د.أ" };
const STEP_FAMILY: Profile = { housingType: "ملك", monthlyExpenses: "300-500 د.أ" };
const STEP_ABOUT: Profile = { aboutMe: "نبذة قصيرة" };
const STEP_LOOKING: Profile = { prefAgeMin: 25, prefAgeMax: 35 };
const FULL: Profile = { ...STEP_YOU, ...STEP_FAITH, ...STEP_WORK, ...STEP_FAMILY, ...STEP_ABOUT, ...STEP_LOOKING };

let fetchSpy: MockInstance<typeof fetch>;

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body, clone() { return this; } } as unknown as Response);
}

function mockProfile(profile: Profile | null, { country = "JO", gender = "MALE", putOk = true, setupStep = 3 } = {}) {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    if (url === "/api/profile" && !init?.method) {
      return json({ user: { id: "u1", gender, country, profile: profile ? { ...profile, setupStep, isComplete: false } : null } });
    }
    if (url === "/api/profile" && init?.method === "PUT") return putOk ? json({ success: true }) : json({ error: "تعذّر حفظ ملفك" }, false);
    return json({});
  });
}

const next = () => act(() => fireEvent.click(screen.getByRole("button", { name: /التالي/ })));
const finish = async () => act(async () => fireEvent.click(screen.getByRole("button", { name: /حفظ والبدء/ })));
const heading = (name: string) => screen.getByRole("heading", { level: 1, name });
const waitHeading = (name: string) => waitFor(() => expect(heading(name)).toBeTruthy());
/** The button group of a field (its control id is the field key) */
const group = (key: string) => document.getElementById(key) as HTMLElement;
const pickFirst = (key: string) => fireEvent.click(within(group(key)).getAllByRole("button")[0]);
const body = (url: string) => {
  const call = fetchSpy.mock.calls.find((c) => String(c[0]) === url && (c[1] as RequestInit)?.method === "PUT");
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined;
};

beforeEach(() => {
  vi.restoreAllMocks();
  router.push.mockClear();
  ctx.refreshProfile.mockClear();
  autoSave.saveToServer.mockClear();
  autoSave.clearDraft.mockClear();
  autoSave.saveToLocalStorage.mockClear();
  settings.redesign = false;
  settings.introRequests = true;
  ctx.religionEnabled = false;
  ctx.mutual = true;
  ctx.countsMissing = false;
  localDraft.value = null;
});

describe("ShortSetup: every field in 7 steps (auth_profile_redesign)", () => {
  it("a new member starts at «عنك», step 1 of 7", async () => {
    mockProfile(null);
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("عنك");
    expect(screen.getByText("الخطوة 1 من 7")).toBeTruthy();
    expect(screen.getAllByTestId("setup-progress-segment")).toHaveLength(7);
    for (const key of ["dateOfBirth", "nationality", "city", "maritalStatus", "skinColor", "height", "weight"]) {
      expect(document.querySelector(`[data-field="${key}"]`)).toBeTruthy();
    }
  });

  it("6 steps where the legacy shows no «شروط أساسية» (mutualSuggestions off)", async () => {
    ctx.mutual = false;
    mockProfile(null);
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("عنك");
    expect(screen.getByText("الخطوة 1 من 6")).toBeTruthy();
    expect(screen.getAllByTestId("setup-progress-segment")).toHaveLength(6);
  });

  it("walks the step names in order", async () => {
    mockProfile(STEP_YOU);
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("الدين ونمط الحياة");
    expect(screen.getByText("الخطوة 2 من 7")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /السابق/ }));
    expect(heading("عنك")).toBeTruthy();
  });

  it("step 1: required errors under their fields, a range error for the height, and it stays", async () => {
    mockProfile(null);
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("عنك");
    fireEvent.change(screen.getByLabelText(/^الطول/), { target: { value: "300" } });
    next();
    expect(document.getElementById("dateOfBirth-error")?.textContent).toBe("تاريخ الميلاد مطلوب");
    expect(document.getElementById("city-error")?.textContent).toBe("المدينة مطلوبة");
    expect(document.getElementById("maritalStatus-error")?.textContent).toBe("الحالة الاجتماعية مطلوبة");
    expect(document.getElementById("skinColor-error")?.textContent).toBe("لون البشرة مطلوب");
    expect(document.getElementById("height-error")?.textContent).toBe("الطول يجب أن يكون بين 100 و250 سم");
    // Nationality starts with the country's default; the weight may stay empty
    expect(document.getElementById("nationality-error")).toBeNull();
    expect(document.getElementById("weight-error")).toBeNull();
    expect(heading("عنك")).toBeTruthy();
    expect(autoSave.saveToServer).not.toHaveBeenCalled();
  });

  it("single → children count 0, hidden; another status asks it", async () => {
    mockProfile({ ...STEP_YOU, maritalStatus: "", childrenCount: null }, { setupStep: 1 });
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("عنك");
    expect(screen.queryByLabelText("عدد الأبناء")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "مطلق" }));
    expect(screen.getByLabelText("عدد الأبناء")).toBeTruthy();
    next();
    expect(document.getElementById("childrenCount-error")?.textContent).toBe("عدد الأبناء مطلوب");
    fireEvent.click(screen.getByRole("button", { name: "أعزب" }));
    expect(screen.queryByLabelText("عدد الأبناء")).toBeNull();
    next();
    expect(autoSave.saveToServer).toHaveBeenCalledWith(2, expect.objectContaining({ maritalStatus: "أعزب/عزباء", childrenCount: 0, skinColor: "حنطي" }));
    expect(heading("الدين ونمط الحياة")).toBeTruthy();
  });

  it("resume: a member with «عنك» done opens at step 2", async () => {
    mockProfile({ ...STEP_YOU, ...STEP_WORK, ...STEP_LOOKING, religiosity: "ملتزم" });
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("الدين ونمط الحياة");
  });

  it("step 2 «التالي» with smoking empty shows the error under it and stays", async () => {
    mockProfile({ ...STEP_YOU, ...STEP_FAITH, smokingStatus: null });
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("الدين ونمط الحياة");
    next();
    const field = document.querySelector('[data-field="smokingStatus"]') as HTMLElement;
    expect(within(field).getByText("التدخين مطلوب")).toBeTruthy();
    expect(document.querySelectorAll("[id$='-error']").length).toBe(1);
    expect(heading("الدين ونمط الحياة")).toBeTruthy();
    expect(autoSave.saveToServer).not.toHaveBeenCalled();
  });

  it("a Christian woman in Lebanon (religion on) sees no hijab and no «المذهب», and passes step 2", async () => {
    ctx.religionEnabled = true;
    mockProfile({ ...STEP_YOU, city: "بيروت", nationality: "لبنانية", hijab: true, sect: "سني" }, { country: "LB", gender: "FEMALE" });
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("الدين ونمط الحياة");
    // Nothing preselected for «الديانة»; «المذهب» and the hijab show for a Muslim
    expect(screen.getByRole("button", { name: "مسلمة" }).getAttribute("aria-pressed")).toBe("false");
    expect(group("sect")).toBeTruthy();
    expect(group("hijab")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "مسيحية" }));
    expect(group("sect")).toBeNull();
    expect(group("hijab")).toBeNull();
    for (const key of ["religiosity", "smokingStatus", "cookingAbility", "lifestyle", "drivingLicense", "willingToRelocate"]) pickFirst(key);
    next();
    expect(heading("التعليم والعمل")).toBeTruthy();
    const draft = autoSave.saveToServer.mock.calls[0][1] as Record<string, unknown>;
    expect(draft.religion).toBe("مسيحي");
    for (const key of MUSLIM_ONLY_FIELDS) expect(draft[key]).toBeUndefined();
  });

  it("«الديانة» off: no religion question, nothing sent", async () => {
    mockProfile({ ...STEP_YOU, religion: "مسيحي" });
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("الدين ونمط الحياة");
    expect(group("religion")).toBeNull();
    // A stored Christian: no beard row
    expect(group("beard")).toBeNull();
    for (const key of ["religiosity", "smokingStatus", "cookingAbility", "lifestyle", "drivingLicense", "willingToRelocate"]) pickFirst(key);
    next();
    const draft = autoSave.saveToServer.mock.calls[0][1] as Record<string, unknown>;
    expect(draft.religion).toBeUndefined();
    expect(draft.prefReligion).toBeUndefined();
  });

  it("job «أخرى» with no text is refused; typed text moves on", async () => {
    mockProfile({ ...STEP_YOU, ...STEP_FAITH, education: "بكالوريوس", incomeRange: "500-1000 د.أ" });
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("التعليم والعمل");
    fireEvent.click(screen.getByRole("button", { name: "أخرى" }));
    next();
    // The error sits under the text box (not a red border on the whole list), and the text box gets the focus
    const text = screen.getByLabelText("ما وظيفتك؟");
    expect(document.getElementById("job-other-error")?.textContent).toBe("يرجى تحديد الوظيفة");
    expect(text.getAttribute("aria-describedby")).toBe("job-other-error");
    expect(document.getElementById("job-error")).toBeNull();
    expect(group("job").getAttribute("aria-describedby")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(text));
    expect(heading("التعليم والعمل")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("ما وظيفتك؟"), { target: { value: "خبير تجميل" } });
    next();
    expect(heading("العائلة")).toBeTruthy();
    expect(autoSave.saveToServer).toHaveBeenCalledWith(4, expect.objectContaining({ job: "خبير تجميل" }));
  });

  it("«من تبحث عنه» needs both ends of the age range", async () => {
    mockProfile({ ...FULL, beard: null, hijab: true, niqab: false, prefAgeMin: null, prefAgeMax: null }, { gender: "FEMALE" });
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("من تبحثين عنه");
    fireEvent.change(screen.getByLabelText("من"), { target: { value: "25" } });
    next();
    expect(document.getElementById("prefAgeMin-error")?.textContent).toBe("يرجى إدخال العمر الأدنى والأقصى");
    fireEvent.change(screen.getByLabelText("إلى"), { target: { value: "20" } });
    next();
    expect(document.getElementById("prefAgeMin-error")?.textContent).toBe("العمر الأدنى يجب أن يكون أقل من العمر الأقصى");
    fireEvent.change(screen.getByLabelText("إلى"), { target: { value: "35" } });
    next();
    expect(heading("شروط أساسية")).toBeTruthy();
  });

  it("«حفظ والبدء» PUTs every step's answers, then the ticked «شروط أساسية», then «ملفك جاهز»", async () => {
    mockProfile({ ...FULL, prefCity: ["عمّان"], dealbreakers: ["city"] });
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("شروط أساسية");
    expect(screen.getByText("الخطوة 7 من 7")).toBeTruthy();
    expect(screen.getByText("لن نقترح عليك من لا يحققه.")).toBeTruthy();
    // One toggle per filled preference with a «شرط أساسي»: the age range and the cities
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes.map((b) => b.checked)).toEqual([false, true]);
    fireEvent.click(boxes[0]);
    await finish();
    await waitHeading("ملفك جاهز");

    expect(body("/api/profile")).toMatchObject({
      dateOfBirth: "1995-03-14",
      skinColor: "حنطي",
      beard: true,
      smokingStatus: "لا أدخن",
      drivingLicense: true,
      job: "مهندس",
      housingType: "ملك",
      aboutMe: "نبذة قصيرة",
      prefAgeMin: 25,
      prefAgeMax: 35,
      prefCity: ["عمّان"],
      childrenCount: 0,
    });
    // «شروط أساسية» go in the same save, as the legacy setup; no separate call
    expect(body("/api/profile").dealbreakers).toEqual(["age", "city"]);
    expect(fetchSpy.mock.calls.some((c) => String(c[0]) === "/api/profile/dealbreakers")).toBe(false);
    expect(ctx.refreshProfile).toHaveBeenCalled();
    expect(autoSave.clearDraft).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "عرض الاقتراحات" }).getAttribute("href")).toBe("/dashboard/suggestions");
    // «ملفك جاهز» lists only what is still empty: no height yet, photos always; about me and preferences are filled
    const later = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(later).toContain("/dashboard/profile/edit?field=job");
    expect(later).toContain("/dashboard/photos");
    expect(later).not.toContain("/dashboard/profile/edit?field=aboutMe");
    expect(later).not.toContain("/dashboard/profile/edit?field=prefAgeMin");
  });

  it("a Christian's final PUT carries all steps and no Muslim-only key (6 steps, no dealbreakers call)", async () => {
    ctx.religionEnabled = true;
    ctx.mutual = false;
    const stored = {
      ...FULL,
      city: "بيروت",
      incomeRange: "500-1000 $",
      monthlyExpenses: "300-700 $",
      religion: "مسيحي",
      beard: null,
      hijab: true,
      niqab: false,
      sect: "سني",
      prefSect: ["سني"],
      prefBeard: "نعم",
    };
    mockProfile(stored, { country: "LB", gender: "FEMALE" });
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("من تبحثين عنه");
    expect(screen.getByText("الخطوة 6 من 6")).toBeTruthy();
    await finish();
    await waitHeading("ملفك جاهز");
    const sent = body("/api/profile");
    expect(sent).toMatchObject({ religion: "مسيحي", religiosity: "ملتزم", job: "مهندس", housingType: "ملك", aboutMe: "نبذة قصيرة", prefAgeMin: 25 });
    for (const key of MUSLIM_ONLY_FIELDS) expect(sent[key]).toBeUndefined();
    // No «شروط أساسية» step (6 steps): nothing about them is sent
    expect(sent.dealbreakers).toBeUndefined();
    expect(fetchSpy.mock.calls.some((c) => String(c[0]) === "/api/profile/dealbreakers")).toBe(false);
  });

  it("a failed final PUT shows the error and not «ملفك جاهز»", async () => {
    mockProfile(FULL, { putOk: false });
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("شروط أساسية");
    await finish();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("تعذّر حفظ ملفك"));
    expect(screen.queryByRole("heading", { name: "ملفك جاهز" })).toBeNull();
    expect(autoSave.clearDraft).not.toHaveBeenCalled();
  });

  it("legacy cycle: the guardian step comes last and saves before the profile", async () => {
    ctx.mutual = false;
    mockProfile(FULL);
    render(<ShortSetup guardianStep />);
    await waitHeading("من تبحث عنه");
    expect(screen.getByText("الخطوة 6 من 7")).toBeTruthy();
    next();
    expect(heading("بيانات ولي الأمر")).toBeTruthy();
    expect(autoSave.saveToServer).toHaveBeenCalledWith(5, expect.objectContaining({ prefAgeMin: 25 }));
    await finish();
    expect(screen.getByText("اسم ولي الأمر مطلوب")).toBeTruthy();
    expect(body("/api/profile")).toBeUndefined();
  });

  it("«حفظ والبدء» checks every earlier step and opens the first one that fails", async () => {
    // A restored local draft with a height step 1 refuses, while the server copy opens the last step
    localDraft.value = { savedAt: new Date().toISOString(), form: { height: "300" } };
    mockProfile(FULL);
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("شروط أساسية");
    await finish();
    expect(heading("عنك")).toBeTruthy();
    expect(document.getElementById("height-error")?.textContent).toBe("الطول يجب أن يكون بين 100 و250 سم");
    expect(body("/api/profile")).toBeUndefined();
  });

  it("the stored setupStep never goes back", async () => {
    // Stored 3; «الدين ونمط الحياة» → «التعليم والعمل» maps to the legacy step 1, so 3 is kept
    mockProfile({ ...STEP_YOU, ...STEP_FAITH, smokingStatus: null }, { setupStep: 3 });
    render(<ShortSetup guardianStep={false} />);
    await waitHeading("الدين ونمط الحياة");
    fireEvent.click(screen.getByRole("button", { name: "لا أدخن" }));
    next();
    expect(heading("التعليم والعمل")).toBeTruthy();
    expect(autoSave.saveToServer).toHaveBeenLastCalledWith(3, expect.anything());
    for (const key of ["education", "job", "incomeRange"]) pickFirst(key);
    next();
    // «العائلة» maps to 4: higher, so it is sent
    expect(autoSave.saveToServer).toHaveBeenLastCalledWith(4, expect.anything());
    fireEvent.click(screen.getByRole("button", { name: /السابق/ }));
    next();
    expect(autoSave.saveToServer).toHaveBeenLastCalledWith(4, expect.anything());
    for (const call of autoSave.saveToLocalStorage.mock.calls) expect(call[2]).toBeGreaterThanOrEqual(3);
  });

  it("waits for /api/me/counts before choosing the steps", async () => {
    ctx.countsMissing = true;
    mockProfile(null);
    const { rerender } = render(<ShortSetup guardianStep={false} />);
    await act(async () => {});
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText(/الخطوة/)).toBeNull();
    expect(fetchSpy.mock.calls.some((c) => String(c[0]) === "/api/profile")).toBe(false);
    ctx.countsMissing = false;
    ctx.mutual = true;
    rerender(<ShortSetup guardianStep={false} />);
    await waitHeading("عنك");
    expect(screen.getByText("الخطوة 1 من 7")).toBeTruthy();
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

  it("wrapper renders the setup when the switch is on", async () => {
    settings.redesign = true;
    mockProfile(STEP_YOU);
    const { default: SetupPage } = await import("@/app/(ar)/dashboard/profile/setup/page");
    render(await SetupPage());
    expect(screen.queryByTestId("legacy-setup")).toBeNull();
    await waitFor(() => expect(screen.getByText("الخطوة 2 من 7")).toBeTruthy());
  });

  it("«ملفك جاهز» without the saved answers lists every row; with them, only the empty ones", () => {
    const { unmount } = render(<SetupDone gender="MALE" />);
    expect(screen.getAllByText("إضافة")).toHaveLength(4);
    unmount();
    render(<SetupDone gender="MALE" profile={{ aboutMe: "نبذة", job: "مهندس", height: 175, prefEducation: ["بكالوريوس"] }} />);
    expect(screen.getAllByText("إضافة")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /صوري/ }).getAttribute("href")).toBe("/dashboard/photos");
  });

  it("«ملفك جاهز» speaks to a woman in the feminine, and its edit links are real rows", () => {
    render(<SetupDone gender="FEMALE" />);
    expect(screen.getByText("أكملي ملفكِ متى شئتِ · يزيد فرصكِ")).toBeTruthy();
    expect(screen.queryByText("أكمل ملفك متى شئت · يزيد فرصك")).toBeNull();
    for (const key of ["aboutMe", "job", "prefAgeMin"]) expect(editField(key)?.key).toBe(key);
  });
});
