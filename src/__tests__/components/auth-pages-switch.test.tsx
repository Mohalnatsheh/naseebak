import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const enabled = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/settings", () => ({ getAuthRedesignEnabled: async () => enabled.on }));
vi.mock("@/components/auth/auth-flow", () => ({
  AuthFlow: (p: { mode: string; callbackUrl?: string; inviteCode?: string; existsNotice?: boolean }) => (
    <div data-testid="auth-flow" data-mode={p.mode} data-cb={p.callbackUrl ?? ""} data-invite={p.inviteCode ?? ""} data-exists={String(!!p.existsNotice)} />
  ),
}));
vi.mock("@/app/(ar)/login/legacy-login-page", () => ({ default: () => <div data-testid="legacy-login" /> }));
vi.mock("@/app/(ar)/register/legacy-register-page", () => ({ default: () => <div data-testid="legacy-register" /> }));

import LoginPage from "@/app/(ar)/login/page";
import RegisterPage from "@/app/(ar)/register/page";

beforeEach(() => {
  enabled.on = false;
});

describe("auth pages follow auth_profile_redesign", () => {
  it("renders legacy login when off", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("legacy-login")).toBeTruthy();
    expect(screen.queryByTestId("auth-flow")).toBeNull();
  });

  it("renders AuthFlow mode=login with callbackUrl and exists when on", async () => {
    enabled.on = true;
    render(await LoginPage({ searchParams: Promise.resolve({ callbackUrl: "/dashboard/x", exists: "true" }) }));
    const el = screen.getByTestId("auth-flow");
    expect(el.dataset.mode).toBe("login");
    expect(el.dataset.cb).toBe("/dashboard/x");
    expect(el.dataset.exists).toBe("true");
    expect(screen.queryByTestId("legacy-login")).toBeNull();
  });

  it("renders legacy register when off", async () => {
    render(await RegisterPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("legacy-register")).toBeTruthy();
  });

  it("renders AuthFlow mode=register with the invitation code when on (also from=login)", async () => {
    enabled.on = true;
    render(await RegisterPage({ searchParams: Promise.resolve({ invitationCode: "ABC123", from: "login" } as never) }));
    const el = screen.getByTestId("auth-flow");
    expect(el.dataset.mode).toBe("register");
    expect(el.dataset.invite).toBe("ABC123");
    expect(screen.queryByTestId("legacy-register")).toBeNull();
  });
});
