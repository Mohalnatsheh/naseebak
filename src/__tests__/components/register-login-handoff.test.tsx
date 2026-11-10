import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => params.current,
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn(async () => ({ error: undefined })) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn(), trackMetaEvent: vi.fn() }));

import RegisterPage from "@/app/(ar)/register/page";
import LoginPage from "@/app/(ar)/login/page";
import { localPhone } from "@/lib/phone";

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  params.current = new URLSearchParams();
});

describe("localPhone", () => {
  it("turns any accepted format into the number typed at home", () => {
    expect(localPhone("962771000103")).toBe("0771000103");
    expect(localPhone("+966512345678")).toBe("0512345678");
    expect(localPhone("0791234567")).toBe("0791234567");
  });
});

describe("sign-in with a number that has no account (QA WA-07)", () => {
  it("opens sign-up with the local number and says why", async () => {
    params.current = new URLSearchParams("from=login");
    sessionStorage.setItem("naseeb:register-handoff", JSON.stringify({ phone: "962771000103", otp: "111111", at: Date.now() }));
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText(/لا يوجد حساب بهذا الرقم، يمكنك إنشاء حساب/)).toBeTruthy());
    expect(screen.getByDisplayValue("0771000103")).toBeTruthy();
    expect(screen.queryByDisplayValue("962771000103")).toBeNull();
  });
});

describe("login errors are announced (QA WA-16)", () => {
  it("the error box has role=alert", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "خطأ تجريبي" }) } as Response);
    render(<LoginPage />);
    const input = document.getElementById("phone") as HTMLInputElement;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "0771000103" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /رمز/ }));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("خطأ تجريبي"));
  });
});

describe("register errors point at their field by state, not wording (review X3 minor 5)", () => {
  it("an empty last name marks only the last name; a refused number marks the phone, a rate limit no field", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: "هذا الرقم لا يتبع الدولة المختارة", code: "COUNTRY_MISMATCH" }),
    } as Response);
    render(<RegisterPage />);
    await waitFor(() => expect(document.getElementById("firstName")).not.toBeNull());
    const first = document.getElementById("firstName") as HTMLInputElement;
    const last = document.getElementById("lastName") as HTMLInputElement;
    const phone = document.getElementById("phone") as HTMLInputElement;
    fireEvent.change(first, { target: { value: "سامي" } });
    fireEvent.change(phone, { target: { value: "0771000103" } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /رمز/ })[0]);
    });
    await waitFor(() => expect(last.getAttribute("aria-invalid")).toBe("true"));
    expect(last.getAttribute("aria-describedby")).toBe("register-error");
    expect(first.getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(last, { target: { value: "خالد" } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /رمز/ })[0]);
    });
    // The refusal names no field in its words: it still points at the number it was about
    await waitFor(() => expect(phone.getAttribute("aria-invalid")).toBe("true"));
    expect(last.getAttribute("aria-invalid")).toBeNull();
    // A rate limit is about the request, not the number (review X4b minor 9)
    fetchSpy.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: "محاولات كثيرة" }) } as Response);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /رمز/ })[0]);
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("محاولات كثيرة"));
    expect(phone.getAttribute("aria-invalid")).toBeNull();
  });
});
