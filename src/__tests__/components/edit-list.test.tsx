import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const ctx = vi.hoisted(() => ({ refreshProfile: vi.fn(async () => {}), religionEnabled: false }));
const settings = vi.hoisted(() => ({ redesign: false }));

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/dashboard/profile/edit" }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    refreshProfile: ctx.refreshProfile,
    profile: { phone: "962777000001" },
    country: "JO",
    counts: { religionEnabled: ctx.religionEnabled, flags: { introRequests: true, chat: true, mutualSuggestions: true, authRedesign: true } },
  }),
}));
vi.mock("@/lib/settings", () => ({ getAuthRedesignEnabled: async () => settings.redesign }));
vi.mock("@/app/(ar)/dashboard/profile/edit/legacy-edit-page", () => ({ default: () => <div data-testid="legacy-edit" /> }));

import Link from "next/link";
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
  gender?: "MALE" | "FEMALE";
  guardian?: Values | null;
  guardianPut?: { status: number; body: unknown };
  /** PUT /api/profile waits for this */
  putGate?: Promise<void>;
}

function mockApi({
  profile = STORED,
  pending = null,
  failProfile = false,
  review = { status: 200, body: { requested: true } },
  gender = "MALE",
  guardian = null,
  guardianPut = { status: 200, body: { message: "ok" } },
  putGate,
}: MockOpts = {}) {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/profile" && method === "GET") {
      return failProfile ? json({ error: "x" }, 500) : json({ user: { id: "u1", gender, country: "JO", profile } });
    }
    if (url === "/api/profile/update-request" && method === "GET") {
      return json({ requests: pending ? [{ status: "PENDING", changes: pending }] : [] });
    }
    if (url === "/api/profile/update-request" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      const prefsOnly = Object.keys(body.changes).every((k) => k.startsWith("pref"));
      return prefsOnly ? json({ applied: Object.keys(body.changes) }) : json(review.body, review.status);
    }
    if (url === "/api/profile/parent-info" && method === "GET") return json({ parentInfo: guardian });
    if (url === "/api/profile/parent-info") return json(guardianPut.body, guardianPut.status);
    if (url === "/api/profile" && method === "PUT" && putGate) return putGate.then(() => json({ success: true }));
    return json({ success: true });
  });
}

const bodyOf = (url: string, method: string) =>
  JSON.parse(String(fetchSpy.mock.calls.find(([u, i]) => String(u) === url && i?.method === method)?.[1]?.body));
const save = () => fireEvent.click(within(screen.getByRole("region", { name: "شريط الحفظ" })).getByRole("button", { name: "حفظ" }));
const pick = (name: string) => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name }));

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
  ctx.religionEnabled = false;
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
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
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
    // The banner is brought into view and focused
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("status"));
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
    expect(screen.getByRole("status").textContent).toBe("سُحب طلب التعديل.");
  });

  it("«سحب الطلب» replaces the last save's banner with its own confirmation", async () => {
    mockApi({ pending: { city: "إربد" } });
    render(<EditList />);
    await ready();
    openRow("prefAgeMin");
    fireEvent.change(screen.getByLabelText("من"), { target: { value: "27" } });
    done();
    save();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("حُفظ العمر المفضل."));
    fireEvent.click(screen.getByRole("button", { name: "سحب الطلب" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("سُحب طلب التعديل."));
    expect(screen.queryByText(/حُفظ العمر المفضل/)).toBeNull();
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

  it("?field=city opens the city editor; ?step=3 opens the partner preferences", async () => {
    mockApi();
    window.history.replaceState(null, "", "/dashboard/profile/edit?field=city");
    // The editor is modal: the page behind it is hidden from the accessibility tree
    const { unmount } = render(<EditList />);
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "المدينة" })).toBeTruthy());
    // Read once: the query leaves the address so a reload doesn't reopen the editor
    expect(router.replace).toHaveBeenCalledWith("/dashboard/profile/edit", { scroll: false });
    unmount();
    window.history.replaceState(null, "", "/dashboard/profile/edit?step=3");
    render(<EditList />);
    // Old step 3 was the partner preferences: every ?step=3 link means them
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "العمر المفضل" })).toBeTruthy());
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
    expect(within(dialog).getByText("لم تُحفظ تعديلاتك بعد. إذا خرجت الآن فلن تُحفظ.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "تجاهل" }));
    expect(router.push).toHaveBeenCalledWith("/dashboard/profile");
  });

  it("«تجاهل التعديلات؟» speaks to a woman in the feminine", async () => {
    mockApi({ gender: "FEMALE" });
    render(<EditList />);
    await ready();
    openRow("fieldOfStudy");
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox"), { target: { value: "طب" } });
    done();
    fireEvent.click(screen.getByRole("link", { name: "ملفي" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("لم تُحفظ تعديلاتكِ بعد. إذا خرجتِ الآن فلن تُحفظ.")).toBeTruthy();
  });

  it("without a deep link the address is left alone", async () => {
    mockApi();
    render(<EditList />);
    await ready();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("load failure shows LoadError and no save bar", async () => {
    mockApi({ failProfile: true });
    render(<EditList />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("فلا يمكن التعديل الآن"));
    expect(row("city")).toBeNull();
    expect(screen.queryByRole("region", { name: "شريط الحفظ" })).toBeNull();
  });
});

describe("EditList fix round 1", () => {
  it("a change made while the save is pending survives it", async () => {
    let open!: () => void;
    const putGate = new Promise<void>((r) => (open = r));
    mockApi({ putGate });
    render(<EditList />);
    await ready();
    openRow("fieldOfStudy");
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox"), { target: { value: "طب" } });
    done();
    save();
    // The PUT is still running: edit another empty row
    await waitFor(() => expect(calls()).toEqual(["PUT /api/profile"]));
    openRow("hobbies");
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox"), { target: { value: "القراءة" } });
    done();
    open();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("حُفظ التخصص."));
    expect(row("hobbies").dataset.state).toBe("fill");
    expect(within(screen.getByRole("region", { name: "شريط الحفظ" })).getByText("تعديل واحد")).toBeTruthy();
  });

  it("marital status: single sets the children to 0, another status puts back what the member had", async () => {
    mockApi({ profile: { ...STORED, maritalStatus: "مطلق/مطلقة", childrenCount: 2 } });
    render(<EditList />);
    await ready();
    expect(within(row("childrenCount")).getByText("2")).toBeTruthy();
    openRow("maritalStatus");
    pick("أعزب");
    done();
    expect(row("childrenCount")).toBeNull();
    expect(within(screen.getByRole("region", { name: "شريط الحفظ" })).getByText("تعديل واحد")).toBeTruthy();
    // Back: the auto 0 goes, nothing is left to save
    openRow("maritalStatus");
    pick("مطلق");
    done();
    expect(row("childrenCount").dataset.state).toBe("idle");
    expect(within(row("childrenCount")).getByText("2")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "شريط الحفظ" })).toBeNull();
    // A count the member set comes back after single → divorced
    openRow("childrenCount");
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox"), { target: { value: "3" } });
    done();
    openRow("maritalStatus");
    pick("أعزب");
    done();
    openRow("maritalStatus");
    pick("مطلق");
    done();
    expect(within(row("childrenCount")).getByText("3")).toBeTruthy();
    expect(row("childrenCount").dataset.state).toBe("review");
  });

  it("hijab writes hijab and niqab together", async () => {
    mockApi({ gender: "FEMALE", profile: { ...STORED, maritalStatus: "أعزب/عزباء", hijab: null, niqab: null } });
    render(<EditList />);
    await ready();
    expect(within(row("hijab")).getByText("إضافة")).toBeTruthy();
    openRow("hijab");
    pick("منتقبة");
    done();
    expect(within(row("hijab")).getByText("منتقبة")).toBeTruthy();
    expect(row("hijab").dataset.state).toBe("fill");
    expect(within(screen.getByRole("region", { name: "شريط الحفظ" })).getByText("تعديل واحد")).toBeTruthy();
    save();
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    const put = bodyOf("/api/profile", "PUT");
    expect(put.hijab).toBe(true);
    expect(put.niqab).toBe(true);
  });

  it("job «أخرى» opens a free-text box, also for a stored job that is not an option", async () => {
    mockApi({ profile: { ...STORED, job: "مزارع" } });
    render(<EditList />);
    await ready();
    expect(within(row("job")).getByText("مزارع")).toBeTruthy();
    openRow("job");
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "أخرى" }).getAttribute("aria-pressed")).toBe("true");
    const other = within(dialog).getByLabelText("ما وظيفتك؟") as HTMLInputElement;
    expect(other.value).toBe("مزارع");
    fireEvent.change(other, { target: { value: "" } });
    done();
    expect(within(screen.getByRole("dialog")).getByText("يرجى تحديد الوظيفة")).toBeTruthy();
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("ما وظيفتك؟"), { target: { value: "نجار" } });
    done();
    expect(within(row("job")).getByText("نجار")).toBeTruthy();
    expect(row("job").dataset.state).toBe("review");
    // A listed job closes the box and stores the option itself
    openRow("job");
    dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "مهندس" }));
    expect(within(dialog).queryByLabelText("ما وظيفتك؟")).toBeNull();
    done();
    save();
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(bodyOf("/api/profile/update-request", "POST")).toEqual({ changes: { job: "مهندس" } });
  });

  it("yes/no rows write booleans, and a stored false shows «لا»", async () => {
    mockApi({ profile: { ...STORED, drivingLicense: false, beard: null } });
    render(<EditList />);
    await ready();
    expect(within(row("drivingLicense")).getByText("لا")).toBeTruthy();
    expect(within(row("beard")).getByText("إضافة")).toBeTruthy();
    openRow("drivingLicense");
    expect(within(screen.getByRole("dialog")).getByText("تغيير رخصة القيادة يُرسل لفريق نصيبك للمراجعة قبل ظهوره.")).toBeTruthy();
    pick("نعم");
    done();
    expect(row("drivingLicense").dataset.state).toBe("review");
    openRow("beard");
    pick("غير ملتحٍ");
    done();
    expect(row("beard").dataset.state).toBe("fill");
    save();
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(bodyOf("/api/profile", "PUT").beard).toBe(false);
    expect(bodyOf("/api/profile/update-request", "POST")).toEqual({ changes: { drivingLicense: true } });
  });

  it("a link outside the page asks «تجاهل التعديلات؟» while dirty, then follows it", async () => {
    mockApi();
    render(
      <>
        <nav>
          <Link href="/dashboard/suggestions">الاقتراحات</Link>
          <a href="/dashboard/chats" target="_blank">المحادثات</a>
          <a href="#top">أعلى</a>
        </nav>
        <EditList />
      </>,
    );
    await ready();
    const link = () => screen.getByRole("link", { name: "الاقتراحات" });
    // Not dirty: nothing stops it
    expect(fireEvent.click(link())).toBe(true);
    openRow("fieldOfStudy");
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox"), { target: { value: "طب" } });
    done();
    // Modified clicks, new tabs and same-page jumps pass
    expect(fireEvent.click(link(), { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(screen.getByRole("link", { name: "المحادثات" }))).toBe(true);
    expect(fireEvent.click(screen.getByRole("link", { name: "أعلى" }))).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fireEvent.click(link())).toBe(false);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("تجاهل التعديلات؟")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "تجاهل" }));
    expect(router.push).toHaveBeenCalledWith("/dashboard/suggestions");
  });
});

describe("fix round 2", () => {
  it("a Muslim-only change dropped for a Christian doesn't linger after the save", async () => {
    ctx.religionEnabled = true;
    mockApi({ profile: { ...STORED, religion: "مسلم", beard: null } });
    render(<EditList />);
    await ready();
    openRow("beard");
    pick("غير ملتحٍ");
    done();
    expect(row("beard").dataset.state).toBe("fill");
    openRow("religion");
    pick("مسيحي");
    done();
    // Hidden for a Christian, and never sent
    expect(row("beard")).toBeNull();
    save();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("الديانة الجديدة أُرسلت للمراجعة"));
    expect(calls()).toEqual(["POST /api/profile/update-request"]);
    expect(bodyOf("/api/profile/update-request", "POST")).toEqual({ changes: { religion: "مسيحي" } });
    // The reloaded profile shows: the dropped beard answer is gone
    expect(row("beard").dataset.state).toBe("idle");
    expect(within(row("beard")).getByText("إضافة")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "شريط الحفظ" })).toBeNull();
  });

  it.each([
    ["normalized here when the server sends no row", { message: "ok" }, "962791234567"],
    ["as the server stored it", { parentInfo: { parentPhone: "+962791234567" } }, "+962791234567"],
  ])("after a guardian save the phone is kept %s, so a consent-only save sends the stored contact", async (_l, putBody, phone) => {
    mockApi({ guardianPut: { status: 200, body: putBody } });
    render(<EditList />);
    await ready();
    openRow("parentName");
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("اسم ولي الأمر"), { target: { value: "خالد الخطيب" } });
    fireEvent.change(within(dialog).getByLabelText("رقم هاتف ولي الأمر"), { target: { value: "0791234567" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "الأب" }));
    fireEvent.change(within(dialog).getByLabelText("العنوان"), { target: { value: "عمّان، الجبيهة" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("حُفظت بيانات وليّ الأمر."));
    openRow("parentName");
    dialog = screen.getByRole("dialog");
    expect((within(dialog).getByLabelText("رقم هاتف ولي الأمر") as HTMLInputElement).value).toBe(phone);
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(fetchSpy.mock.calls.filter(([u, i]) => String(u) === "/api/profile/parent-info" && i?.method === "PUT")).toHaveLength(2));
    const second = fetchSpy.mock.calls.filter(([u, i]) => String(u) === "/api/profile/parent-info" && i?.method === "PUT")[1];
    expect(JSON.parse(String(second[1]?.body))).toEqual({
      parentName: "خالد الخطيب",
      parentPhone: phone,
      relationship: "father",
      address: "عمّان، الجبيهة",
      shareConsent: true,
    });
  });
});

const GUARDIAN = { parentName: "خالد الخطيب", parentPhone: "+962791234567", relationship: "father", address: "عمّان، الجبيهة", shareConsentAt: null };

describe("guardian row (website)", () => {
  it("shows the stored guardian, prefills the editor and saves at once with the legacy body", async () => {
    mockApi({ guardian: GUARDIAN, pending: { city: "إربد" } });
    render(<EditList />);
    await ready();
    // Never locked by a pending request
    expect(within(row("parentName")).getByText("خالد الخطيب · الأب")).toBeTruthy();
    openRow("parentName");
    const dialog = screen.getByRole("dialog");
    expect((within(dialog).getByLabelText("اسم ولي الأمر") as HTMLInputElement).value).toBe("خالد الخطيب");
    expect((within(dialog).getByLabelText("رقم هاتف ولي الأمر") as HTMLInputElement).value).toBe("+962791234567");
    expect(within(dialog).getByRole("button", { name: "الأب" }).getAttribute("aria-pressed")).toBe("true");
    expect((within(dialog).getByLabelText("العنوان") as HTMLTextAreaElement).value).toBe("عمّان، الجبيهة");
    fireEvent.click(within(dialog).getByRole("button", { name: "الأم" }));
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("حُفظت بيانات وليّ الأمر."));
    expect(calls()).toEqual(["PUT /api/profile/parent-info"]);
    expect(bodyOf("/api/profile/parent-info", "PUT")).toEqual({
      parentName: "خالد الخطيب",
      parentPhone: "+962791234567",
      relationship: "mother",
      address: "عمّان، الجبيهة",
      shareConsent: true,
    });
    expect(within(row("parentName")).getByText("خالد الخطيب · الأم")).toBeTruthy();
    // Not part of the save bar
    expect(screen.queryByRole("region", { name: "شريط الحفظ" })).toBeNull();
  });

  it("shows each check under its field, including the member's own phone", async () => {
    mockApi();
    render(<EditList />);
    await ready();
    expect(within(row("parentName")).getByText("إضافة")).toBeTruthy();
    openRow("parentName");
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("اسم ولي الأمر"), { target: { value: "Ahmad" } });
    fireEvent.change(within(dialog).getByLabelText("رقم هاتف ولي الأمر"), { target: { value: "٠٧٧٧٠٠٠٠٠١" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));
    const name = within(dialog).getByLabelText("اسم ولي الأمر");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(name.getAttribute("aria-describedby")!)?.textContent).toBe("يرجى كتابة اسم ولي الأمر باللغة العربية");
    expect(within(dialog).getByText("رقم وليّ الأمر يجب أن يختلف عن رقم هاتفك")).toBeTruthy();
    expect(within(dialog).getByText("صلة القرابة مطلوبة")).toBeTruthy();
    expect(within(dialog).getByText("العنوان مطلوب")).toBeTruthy();
    expect(calls()).toEqual([]);
  });

  it("?step=5 opens the guardian editor", async () => {
    mockApi();
    window.history.replaceState(null, "", "/dashboard/profile/edit?step=5");
    render(<EditList />);
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "وليّ الأمر" })).toBeTruthy());
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
