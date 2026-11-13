import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const ctx = vi.hoisted(() => ({ refreshProfile: vi.fn(async () => {}) }));
const settings = vi.hoisted(() => ({ redesign: false }));

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/dashboard/profile/edit" }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    refreshProfile: ctx.refreshProfile,
    profile: { phone: "+962777000001" },
    country: "JO",
    counts: { religionEnabled: false, flags: { introRequests: true, chat: true, mutualSuggestions: true, authRedesign: true } },
  }),
}));
vi.mock("@/lib/settings", () => ({ getAuthRedesignEnabled: async () => settings.redesign }));
vi.mock("@/app/(ar)/dashboard/profile/edit/legacy-edit-page", () => ({ default: () => <div data-testid="legacy-edit" /> }));

import { EditList } from "@/components/profile/edit/edit-list";
import ProfileEditPage from "@/app/(ar)/dashboard/profile/edit/page";

type Values = Record<string, unknown>;

const STORED: Values = {
  isComplete: true,
  dateOfBirth: "1995-03-14T00:00:00.000Z",
  nationality: "أردني",
  city: "عمّان",
  area: null,
  education: "بكالوريوس",
  maritalStatus: "أعزب/عزباء",
  childrenCount: 0,
  religiosity: "ملتزم",
  fieldOfStudy: null,
  aboutMe: "أحب القراءة",
  hobbies: null,
  lifestyle: null,
  prefAgeMin: 25,
  prefAgeMax: 35,
  prefCity: [],
  dealbreakers: [],
};

let fetchSpy: MockInstance<typeof fetch>;

function json(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body, clone() { return this; } } as unknown as Response);
}

interface MockOpts {
  profile?: Values;
  pending?: Values | null;
  failProfile?: boolean;
  review?: { status: number; body: unknown };
}

function mockApi({ profile = STORED, pending = null, failProfile = false, review = { status: 200, body: { requested: true } } }: MockOpts = {}) {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/profile" && method === "GET") {
      return failProfile ? json({ error: "x" }, 500) : json({ user: { id: "u1", gender: "MALE", country: "JO", profile } });
    }
    if (url === "/api/profile/update-request" && method === "GET") {
      return json({ requests: pending ? [{ status: "PENDING", changes: pending }] : [] });
    }
    if (url === "/api/profile/update-request" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      const prefsOnly = Object.keys(body.changes).every((k) => k.startsWith("pref"));
      return prefsOnly ? json({ applied: Object.keys(body.changes) }) : json(review.body, review.status);
    }
    return json({ success: true });
  });
}

const calls = () => fetchSpy.mock.calls.map(([u, i]) => `${i?.method ?? "GET"} ${String(u)}`).filter((c) => !c.startsWith("GET"));
const row = (key: string) => document.querySelector(`[data-row="${key}"]`) as HTMLElement;
const openRow = (key: string) => fireEvent.click(within(row(key)).getByRole("button"));
const done = () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "تم" }));

async function ready() {
  await waitFor(() => expect(screen.getByRole("heading", { name: "تعديل ملفي" })).toBeTruthy());
}

/** fieldOfStudy (empty) → a fill; city (stored «عمّان») → a review */
async function editTwoRows() {
  openRow("fieldOfStudy");
  fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox"), { target: { value: "هندسة برمجيات" } });
  done();
  openRow("city");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "إربد" }));
  done();
}

beforeEach(() => {
  vi.restoreAllMocks();
  router.push.mockClear();
  router.replace.mockClear();
  ctx.refreshProfile.mockClear();
  settings.redesign = false;
  window.history.replaceState(null, "", "/dashboard/profile/edit");
});

describe("EditList (auth_profile_redesign)", () => {
  it("renders sections and «إضافة» for empty fields", async () => {
    mockApi();
    render(<EditList />);
    await ready();
    for (const title of ["البيانات الأساسية", "التعليم والعمل", "المظهر ونمط الحياة", "عنّي", "العائلة والسكن", "تفضيلات الشريك"]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(screen.getByText("الحقول الفارغة تُحفظ فوراً. تغيير معلومة محفوظة يراجعه فريق نصيبك قبل ظهوره.")).toBeTruthy();
    expect(within(row("fieldOfStudy")).getByText("إضافة")).toBeTruthy();
    expect(within(row("lifestyle")).getByText("إضافة")).toBeTruthy();
    expect(within(row("city")).getByText("عمّان")).toBeTruthy();
    expect(within(row("maritalStatus")).getByText("أعزب")).toBeTruthy();
    expect(within(row("dateOfBirth")).getByText("14 آذار 1995")).toBeTruthy();
    // Single: no children row
    expect(row("childrenCount")).toBeNull();
    expect(screen.queryByRole("region", { name: "شريط الحفظ" })).toBeNull();
  });

  it("editing an empty field marks it «فوراً», a stored one «للمراجعة», and the bar counts 2", async () => {
    mockApi();
    render(<EditList />);
    await ready();
    openRow("city");
    expect(within(screen.getByRole("dialog")).getByText("تغيير المدينة يُرسل لفريق نصيبك للمراجعة قبل ظهوره.")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "إلغاء" }));
    await editTwoRows();
    expect(row("fieldOfStudy").dataset.state).toBe("fill");
    expect(within(row("fieldOfStudy")).getByText("فوراً")).toBeTruthy();
    expect(row("city").dataset.state).toBe("review");
    expect(within(row("city")).getByText("للمراجعة")).toBeTruthy();
    const bar = screen.getByRole("region", { name: "شريط الحفظ" });
    expect(within(bar).getByText("تعديلان")).toBeTruthy();
    expect(within(bar).getByText("1 فوراً · 1 للمراجعة")).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "ملاحظة لفريق المراجعة (اختياري)" })).toBeTruthy();
    // Back to the stored value: no longer a change
    openRow("city");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "عمّان" }));
    done();
    expect(row("city").dataset.state).toBe("idle");
    expect(within(screen.getByRole("region", { name: "شريط الحفظ" })).getByText("تعديل واحد")).toBeTruthy();
  });

  it("save sends PUT for fills then POST update-request, then shows the summary banner", async () => {
    mockApi();
    render(<EditList />);
    await ready();
    await editTwoRows();
    const bar = screen.getByRole("region", { name: "شريط الحفظ" });
    fireEvent.click(within(bar).getByRole("button", { name: "ملاحظة لفريق المراجعة (اختياري)" }));
    fireEvent.change(within(bar).getByRole("textbox"), { target: { value: "انتقلت" } });
    fireEvent.click(within(bar).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("حُفظ التخصص."));
    expect(screen.getByRole("status").textContent).toContain("المدينة الجديدة أُرسلت للمراجعة، وستظهر بعد الموافقة.");
    expect(calls()).toEqual(["PUT /api/profile", "POST /api/profile/update-request"]);
    const put = JSON.parse(String(fetchSpy.mock.calls.find(([, i]) => i?.method === "PUT")?.[1]?.body));
    expect(put.fieldOfStudy).toBe("هندسة برمجيات");
    expect(put.city).toBe("عمّان");
    const post = JSON.parse(String(fetchSpy.mock.calls.find(([, i]) => i?.method === "POST")?.[1]?.body));
    expect(post).toEqual({ changes: { city: "إربد" }, message: "انتقلت" });
    expect(ctx.refreshProfile).toHaveBeenCalled();
  });

  it("review POST failure keeps the failed row marked and names it in the banner", async () => {
    mockApi({ review: { status: 500, body: { error: "خطأ في الخادم" } } });
    render(<EditList />);
    await ready();
    await editTwoRows();
    fireEvent.click(within(screen.getByRole("region", { name: "شريط الحفظ" })).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("لم يُحفظ تعديل المدينة: خطأ في الخادم."));
    expect(screen.getByRole("status").textContent).toContain("حُفظ التخصص.");
    expect(row("city").dataset.state).toBe("review");
    expect(screen.getByRole("region", { name: "شريط الحفظ" })).toBeTruthy();
  });

  it("pending request locks stored rows, keeps empty rows editable, «سحب الطلب» calls withdraw", async () => {
    mockApi({ pending: { city: "إربد" } });
    render(<EditList />);
    await ready();
    expect(screen.getByText(/طلبك قيد المراجعة: المدينة\./)).toBeTruthy();
    expect(row("city").dataset.state).toBe("pending");
    expect(within(row("city")).getByText("قيد المراجعة")).toBeTruthy();
    expect(within(row("city")).getByText("الحالية: عمّان")).toBeTruthy();
    expect(within(row("city")).getByText("إربد")).toBeTruthy();
    expect(within(row("city")).queryByRole("button")).toBeNull();
    expect(row("religiosity").dataset.state).toBe("locked");
    expect(within(row("religiosity")).queryByRole("button")).toBeNull();
    expect(within(row("fieldOfStudy")).getByRole("button")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "سحب الطلب" }));
    await waitFor(() => expect(screen.queryByText(/طلبك قيد المراجعة/)).toBeNull());
    expect(calls()).toEqual(["POST /api/profile/update-request/withdraw"]);
    expect(row("religiosity").dataset.state).toBe("idle");
  });

  it("a preference change saves while a request is pending", async () => {
    mockApi({ pending: { city: "إربد" } });
    render(<EditList />);
    await ready();
    expect(row("prefAgeMin").dataset.state).toBe("idle");
    openRow("prefAgeMin");
    fireEvent.change(screen.getByLabelText("من"), { target: { value: "27" } });
    done();
    expect(row("prefAgeMin").dataset.state).toBe("fill");
    fireEvent.click(within(screen.getByRole("region", { name: "شريط الحفظ" })).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("حُفظ العمر المفضل."));
    expect(calls()).toEqual(["POST /api/profile/update-request"]);
    const post = JSON.parse(String(fetchSpy.mock.calls.find(([, i]) => i?.method === "POST")?.[1]?.body));
    expect(post).toEqual({ changes: { prefAgeMin: 27 } });
  });

  it("the «شرط أساسي» toggle in a preference editor waits for a value", async () => {
    mockApi();
    render(<EditList />);
    await ready();
    openRow("prefCity");
    const dialog = screen.getByRole("dialog");
    const toggle = within(dialog).getByRole("checkbox") as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(within(dialog).getByText("لن نقترح عليك من لا يحققه.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "إربد" }));
    expect(toggle.disabled).toBe(false);
    fireEvent.click(toggle);
    done();
    fireEvent.click(within(screen.getByRole("region", { name: "شريط الحفظ" })).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(calls()).toEqual(["POST /api/profile/update-request", "PUT /api/profile/dealbreakers"]);
    const put = JSON.parse(String(fetchSpy.mock.calls.find(([u]) => String(u) === "/api/profile/dealbreakers")?.[1]?.body));
    expect(put).toEqual({ keys: ["city"] });
  });

  it("?field=city opens the city editor; ?step=3 opens aboutMe", async () => {
    mockApi();
    window.history.replaceState(null, "", "/dashboard/profile/edit?field=city");
    // The editor is modal: the page behind it is hidden from the accessibility tree
    const { unmount } = render(<EditList />);
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "المدينة" })).toBeTruthy());
    unmount();
    window.history.replaceState(null, "", "/dashboard/profile/edit?step=3");
    render(<EditList />);
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "نبذة عني" })).toBeTruthy());
  });

  it("navigating back while dirty asks «تجاهل التعديلات؟»", async () => {
    mockApi();
    render(<EditList />);
    await ready();
    // Not dirty: the link just goes
    expect(fireEvent.click(screen.getByRole("link", { name: "ملفي" }))).toBe(true);
    openRow("fieldOfStudy");
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox"), { target: { value: "طب" } });
    done();
    const leave = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
    expect(fireEvent.click(screen.getByRole("link", { name: "ملفي" }))).toBe(false);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("تجاهل التعديلات؟")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "تجاهل" }));
    expect(router.push).toHaveBeenCalledWith("/dashboard/profile");
  });

  it("load failure shows LoadError and no save bar", async () => {
    mockApi({ failProfile: true });
    render(<EditList />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("فلا يمكن التعديل الآن"));
    expect(row("city")).toBeNull();
    expect(screen.queryByRole("region", { name: "شريط الحفظ" })).toBeNull();
  });
});

describe("edit page wrapper", () => {
  it("wrapper renders legacy edit when off", async () => {
    render(await ProfileEditPage());
    expect(screen.getByTestId("legacy-edit")).toBeTruthy();
  });

  it("renders the edit list when on", async () => {
    settings.redesign = true;
    mockApi();
    render(await ProfileEditPage());
    expect(screen.queryByTestId("legacy-edit")).toBeNull();
    await ready();
  });
});
