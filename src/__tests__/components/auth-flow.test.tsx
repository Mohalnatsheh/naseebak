import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/login",
}));
const signIn = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<{ error?: string; code?: string }>>(async () => ({})));
vi.mock("next-auth/react", () => ({ signIn }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn(), trackMetaEvent: vi.fn() }));

import { AuthFlow } from "@/components/auth/auth-flow";
import { trackEvent } from "@/lib/analytics";

type Reply = { status?: number; body: unknown };
type Routes = Record<string, Reply | Reply[]>;

/** fetch answered per path; an array answers each call in turn (the last one repeats) */
function mockFetch(routes: Routes) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const counters: Record<string, number> = {};
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, body });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    const r = routes[key];
    const n = counters[key] ?? 0;
    counters[key] = n + 1;
    const reply = Array.isArray(r) ? r[Math.min(n, r.length - 1)] : r;
    const status = reply.status ?? 200;
    return { ok: status < 400, status, json: async () => reply.body } as Response;
  });
  return { spy, calls, bodiesFor: (path: string) => calls.filter((c) => c.url.startsWith(path)).map((c) => c.body) };
}

const SENT: Reply = { body: { message: "ok", channel: "sms" } };

async function sendCode(phone = "0791234567") {
  fireEvent.change(screen.getByLabelText("رقم الهاتف"), { target: { value: phone } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "إرسال الرمز" }));
  });
  await screen.findByRole("heading", { name: "أدخل الرمز" });
}

function codeBoxes() {
  return Array.from(screen.getByRole("group", { name: "رمز التحقق" }).querySelectorAll("input"));
}

async function pasteCode(code: string) {
  await act(async () => {
    fireEvent.paste(codeBoxes()[0], { clipboardData: { getData: () => code } });
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  router.push.mockReset();
  router.refresh.mockReset();
  signIn.mockReset();
  signIn.mockResolvedValue({});
  sessionStorage.clear();
});

describe("AuthFlow phone step", () => {
  it("phone step sends login context and converts Arabic-Indic digits", async () => {
    const f = mockFetch({ "/api/auth/send-otp": SENT });
    render(<AuthFlow mode="register" />);
    fireEvent.change(screen.getByLabelText("رقم الهاتف"), { target: { value: "٠٧٩١٢٣٤٥٦٧" } });
    expect((screen.getByLabelText("رقم الهاتف") as HTMLInputElement).value).toBe("0791234567");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إرسال الرمز" }));
    });
    const [body] = f.bodiesFor("/api/auth/send-otp");
    expect(body.context).toBe("login");
    expect(body.country).toBe("JO");
    expect(body.phone).toBe("962791234567");
  });

  it("otp_requested reports the page (register or login) while send-otp keeps the login context", async () => {
    const f = mockFetch({ "/api/auth/send-otp": SENT });
    const { unmount } = render(<AuthFlow mode="register" />);
    await sendCode();
    expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("otp_requested", { context: "register" });
    unmount();
    vi.mocked(trackEvent).mockClear();
    render(<AuthFlow mode="login" />);
    await sendCode();
    expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("otp_requested", { context: "login" });
    expect(f.bodiesFor("/api/auth/send-otp").map((b) => b.context)).toEqual(["login", "login"]);
  });

  it("send-otp 403 shows the server error under the phone field", async () => {
    mockFetch({ "/api/auth/send-otp": { status: 403, body: { error: "التسجيل مغلق حالياً. يرجى المحاولة لاحقاً." } } });
    render(<AuthFlow mode="login" />);
    fireEvent.change(screen.getByLabelText("رقم الهاتف"), { target: { value: "0791234567" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إرسال الرمز" }));
    });
    const input = screen.getByLabelText("رقم الهاتف");
    const errorId = input.getAttribute("aria-describedby")?.split(" ").find((id) => document.getElementById(id)?.textContent?.includes("التسجيل مغلق"));
    expect(errorId).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByRole("heading", { name: "أدخل الرمز" })).toBeNull();
  });

  it("existsNotice shows the legacy banner above the phone step in login mode only", () => {
    const { unmount } = render(<AuthFlow mode="login" existsNotice />);
    expect(screen.getByText(/مسجل مسبقاً. يمكنك تسجيل الدخول من هنا/)).toBeTruthy();
    unmount();
    render(<AuthFlow mode="login" />);
    expect(screen.queryByText(/مسجل مسبقاً/)).toBeNull();
  });

  it("shows the header link for the other mode", () => {
    const { unmount } = render(<AuthFlow mode="login" />);
    expect(screen.getByRole("link", { name: "إنشاء حساب" })).toBeTruthy();
    unmount();
    render(<AuthFlow mode="register" />);
    expect(screen.getByRole("link", { name: "تسجيل الدخول" })).toBeTruthy();
  });
});

describe("AuthFlow code step", () => {
  it("pasting 6 digits into the first code box submits verify-otp", async () => {
    const f = mockFetch({ "/api/auth/send-otp": SENT, "/api/auth/verify-otp": { body: { verified: true, userExists: true } } });
    render(<AuthFlow mode="login" />);
    await sendCode();
    await pasteCode("١٢٣٤٥٦");
    await waitFor(() => expect(f.bodiesFor("/api/auth/verify-otp")).toEqual([{ phone: "962791234567", code: "123456" }]));
  });

  it("typing the sixth digit submits once", async () => {
    const f = mockFetch({ "/api/auth/send-otp": SENT, "/api/auth/verify-otp": { body: { verified: true, userExists: true } } });
    render(<AuthFlow mode="login" />);
    await sendCode();
    for (const [i, d] of ["1", "2", "3", "4", "5", "6"].entries()) {
      await act(async () => {
        fireEvent.change(codeBoxes()[i], { target: { value: d } });
      });
    }
    await waitFor(() => expect(f.bodiesFor("/api/auth/verify-otp")).toHaveLength(1));
  });

  it("wrong code clears boxes and shows «الرمز غير صحيح. تأكد من آخر رسالة وصلتك.»", async () => {
    mockFetch({
      "/api/auth/send-otp": SENT,
      "/api/auth/verify-otp": { status: 400, body: { error: "رمز التحقق غير صالح أو منتهي الصلاحية" } },
    });
    render(<AuthFlow mode="login" />);
    await sendCode();
    await pasteCode("999999");
    await screen.findByText("الرمز غير صحيح. تأكد من آخر رسالة وصلتك.");
    expect(codeBoxes().map((b) => b.value).join("")).toBe("");
    const group = screen.getByRole("group", { name: "رمز التحقق" });
    expect(document.getElementById(group.getAttribute("aria-describedby") ?? "")?.textContent).toContain("الرمز غير صحيح");
  });

  it("WhatsApp channel says «عبر واتساب»", async () => {
    mockFetch({ "/api/auth/send-otp": { body: { message: "ok", channel: "whatsapp" } } });
    render(<AuthFlow mode="login" />);
    await sendCode();
    expect(screen.getByText(/أرسلنا رمزاً من 6 أرقام عبر واتساب إلى/)).toBeTruthy();
    expect(screen.getByText("أرسلنا الرمز عبر واتساب. افتح المحادثة من «نصيبك».")).toBeTruthy();
    expect(screen.queryByText(/وصل الرمز/)).toBeNull();
  });

  it("an SMS code shows no WhatsApp note", async () => {
    mockFetch({ "/api/auth/send-otp": SENT });
    render(<AuthFlow mode="login" />);
    await sendCode();
    expect(screen.queryByText(/افتح المحادثة من «نصيبك»/)).toBeNull();
  });

  it("the resend wait shows as m:ss", async () => {
    mockFetch({ "/api/auth/send-otp": SENT });
    render(<AuthFlow mode="login" />);
    await sendCode();
    expect(screen.getByText(/إعادة الإرسال بعد/).textContent).toContain("1:00");
  });

  it("existing member signs in and goes to callbackUrl", async () => {
    mockFetch({ "/api/auth/send-otp": SENT, "/api/auth/verify-otp": { body: { verified: true, userExists: true } } });
    render(<AuthFlow mode="login" callbackUrl="/dashboard/chats" />);
    await sendCode();
    await pasteCode("111111");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/chats"));
    expect(signIn).toHaveBeenCalledWith("credentials", { phone: "962791234567", otp: "111111", redirect: false });
  });

  it("a failed sign-in after a verified code offers a new code at once, not the wrong-code line", async () => {
    mockFetch({ "/api/auth/send-otp": SENT, "/api/auth/verify-otp": { body: { verified: true, userExists: true } } });
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    render(<AuthFlow mode="login" />);
    await sendCode();
    await pasteCode("111111");
    await screen.findByText(/فشل تسجيل الدخول/);
    expect(screen.queryByText("الرمز غير صحيح. تأكد من آخر رسالة وصلتك.")).toBeNull();
    expect(screen.queryByText(/إعادة الإرسال بعد/)).toBeNull();
    expect(screen.getByRole("button", { name: "إعادة إرسال الرمز" })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("an outside callbackUrl falls back to the dashboard", async () => {
    mockFetch({ "/api/auth/send-otp": SENT, "/api/auth/verify-otp": { body: { verified: true, userExists: true } } });
    render(<AuthFlow mode="login" callbackUrl="https://evil.example/x" />);
    await sendCode();
    await pasteCode("111111");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
  });
});

async function reachRegisterCard(props: { inviteCode?: string } = {}, extra: Routes = {}) {
  const f = mockFetch({
    "/api/auth/send-otp": SENT,
    "/api/auth/verify-otp": { body: { verified: true, userExists: false } },
    "/api/auth/register": { body: { message: "ok" } },
    "/api/referral/apply": { body: { ok: true } },
    ...extra,
  });
  render(<AuthFlow mode="login" {...props} />);
  await sendCode();
  await pasteCode("111111");
  await screen.findByRole("heading", { name: "بياناتك الأساسية" });
  return f;
}

describe("AuthFlow register card", () => {
  it("new number shows «بياناتك الأساسية» and register posts phone+otp+names+gender", async () => {
    const f = await reachRegisterCard();
    expect(signIn).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "سامي" } });
    fireEvent.change(screen.getByLabelText("اسم العائلة"), { target: { value: "خالد" } });
    fireEvent.click(screen.getByRole("button", { name: /رجل/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/profile/setup"));
    expect(f.bodiesFor("/api/auth/register")).toEqual([
      { firstName: "سامي", lastName: "خالد", phone: "962791234567", gender: "MALE", otp: "111111", termsAccepted: true },
    ]);
    expect(signIn).toHaveBeenCalledWith("credentials", { phone: "962791234567", otp: "111111", redirect: false });
    expect(f.bodiesFor("/api/referral/apply")).toEqual([]);
  });

  it("invite field hidden until «لديك رمز دعوة؟», pre-opened with inviteCode", async () => {
    await reachRegisterCard();
    expect(screen.queryByLabelText(/رمز الدعوة/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "لديك رمز دعوة؟" }));
    expect(screen.getByLabelText(/رمز الدعوة/)).toBeTruthy();
  });

  it("an invite code from the link opens the field filled and is applied after sign-up", async () => {
    const f = await reachRegisterCard({ inviteCode: "ab12cd34" });
    expect((screen.getByLabelText(/رمز الدعوة/) as HTMLInputElement).value).toBe("AB12CD34");
    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "سامية" } });
    fireEvent.change(screen.getByLabelText("اسم العائلة"), { target: { value: "خالد" } });
    fireEvent.click(screen.getByRole("button", { name: /امرأة/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/profile/setup"));
    expect(f.bodiesFor("/api/referral/apply")).toEqual([{ code: "AB12CD34" }]);
  });

  it("English letters typed in a name are dropped and the field says why; an Arabic letter clears it", async () => {
    await reachRegisterCard();
    const first = screen.getByLabelText("الاسم الأول") as HTMLInputElement;
    fireEvent.change(first, { target: { value: "Ali" } });
    expect(first.value).toBe("");
    expect(first.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById("register-firstName-error")?.textContent).toBe("الاسم الأول يجب أن يكون بالعربية فقط، بلا أرقام أو رموز");
    fireEvent.change(first, { target: { value: "س" } });
    expect(first.value).toBe("س");
    expect(document.getElementById("register-firstName-error")).toBeNull();
  });
  it("terms unchecked shows the error under the checkbox and does not post", async () => {
    const f = await reachRegisterCard();
    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "سامي" } });
    fireEvent.change(screen.getByLabelText("اسم العائلة"), { target: { value: "خالد" } });
    fireEvent.click(screen.getByRole("button", { name: /رجل/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    });
    const box = screen.getByRole("checkbox");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(box.getAttribute("aria-describedby") ?? "")?.textContent).toContain("يرجى الموافقة على الشروط");
    expect(f.bodiesFor("/api/auth/register")).toEqual([]);
  });

  it("a missing last name is shown under that field only", async () => {
    const f = await reachRegisterCard();
    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "سامي" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    });
    const last = screen.getByLabelText("اسم العائلة");
    expect(last.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(last.getAttribute("aria-describedby") ?? "")?.textContent).toBe("اسم العائلة مطلوب");
    expect(screen.getByLabelText("الاسم الأول").getAttribute("aria-invalid")).toBeNull();
    // The grouped name card is marked as the other fields are
    const card = last.parentElement?.parentElement as HTMLElement;
    expect(card.className).toContain("border-destructive");
    expect(f.bodiesFor("/api/auth/register")).toEqual([]);
    fireEvent.change(last, { target: { value: "خالد" } });
    expect(card.className).not.toContain("border-destructive");
  });

  it("a number that turns out registered signs in and says so", async () => {
    await reachRegisterCard({}, { "/api/auth/register": { status: 409, body: { error: "هذا الرقم مسجل مسبقاً", code: "PHONE_EXISTS" } } });
    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "سامي" } });
    fireEvent.change(screen.getByLabelText("اسم العائلة"), { target: { value: "خالد" } });
    fireEvent.click(screen.getByRole("button", { name: /رجل/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    });
    await screen.findByText(/هذا الرقم مسجّل بحساب سابق/);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalledWith("/dashboard/profile/setup");
  });

  it("a refused invite code is said after the account is made, and «متابعة» goes on to setup", async () => {
    await reachRegisterCard({ inviteCode: "AB12CD34" }, { "/api/referral/apply": { status: 400, body: { error: "رمز الدعوة غير صالح" } } });
    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "سامي" } });
    fireEvent.change(screen.getByLabelText("اسم العائلة"), { target: { value: "خالد" } });
    fireEvent.click(screen.getByRole("button", { name: /رجل/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    });
    await screen.findByText("تم إنشاء حسابك. لم يُطبَّق رمز الدعوة: رمز الدعوة غير صالح");
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "متابعة" }));
    expect(router.push).toHaveBeenCalledWith("/dashboard/profile/setup");
  });

  it("«تغيير الرقم» on the register card goes back to the phone screen", async () => {
    await reachRegisterCard();
    fireEvent.click(screen.getByRole("button", { name: "تغيير الرقم" }));
    expect(screen.getByRole("heading", { name: "ما رقم هاتفك؟" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "بياناتك الأساسية" })).toBeNull();
  });

  it("«تغيير الرقم» is disabled while the account is being created", async () => {
    const f = await reachRegisterCard();
    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "سامي" } });
    fireEvent.change(screen.getByLabelText("اسم العائلة"), { target: { value: "خالد" } });
    fireEvent.click(screen.getByRole("button", { name: /رجل/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    // The register request never answers: the account is still being created
    f.spy.mockImplementation(() => new Promise<Response>(() => {}));
    expect((screen.getByRole("button", { name: "تغيير الرقم" }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    });
    const change = screen.getByRole("button", { name: "تغيير الرقم" }) as HTMLButtonElement;
    expect(change.disabled).toBe(true);
    fireEvent.click(change);
    expect(screen.getByRole("heading", { name: "بياناتك الأساسية" })).toBeTruthy();
  });

  it("the old login page's handoff opens the register card (old links)", async () => {
    sessionStorage.setItem("naseeb:register-handoff", JSON.stringify({ phone: "962791234567", otp: "111111", at: Date.now() }));
    render(<AuthFlow mode="register" />);
    await screen.findByRole("heading", { name: "بياناتك الأساسية" });
    expect(sessionStorage.getItem("naseeb:register-handoff")).toBeNull();
  });
});
