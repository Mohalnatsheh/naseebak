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
