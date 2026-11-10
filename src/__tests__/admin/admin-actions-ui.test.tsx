import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ConfirmProvider } from "@/components/admin/confirm-dialog";
import AdminSettingsPage from "@/app/(en)/admin/settings/page";
import AdminSuggestionsPage from "@/app/(en)/admin/suggestions/page";

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

function routeFetch(routes: [RegExp, (init?: RequestInit) => Response][]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const hit = routes.find(([re]) => re.test(url));
    return hit ? hit[1](init) : json({});
  });
}

const admin = (id: string, firstName: string) => ({ id, firstName, lastName: "x", email: `${id}@a.b`, createdAt: "2026-01-01T00:00:00Z" });

afterEach(() => {
  // A failed assertion inside a fake-timer test must not leave fake timers to the next test (review X2)
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Settings: remove an admin (ADM-08 UI)", () => {
  async function renderSettings(admins: ReturnType<typeof admin>[]) {
    const platform = { minVersion: "", latestVersion: "", storeUrl: "" };
    routeFetch([
      [/\/api\/admin\/settings\/admins$/, () => json({ admins, me: "me" })],
      [/\/api\/admin\/settings\/mobile-app/, () => json({ android: platform, ios: platform, paymentsEnabled: true, androidCertSha256: "" })],
    ]);
    await act(async () => {
      render(
        <ConfirmProvider>
          <AdminSettingsPage />
        </ConfirmProvider>,
      );
    });
  }

  it("offers «Remove» on other admins, never on your own row", async () => {
    await renderSettings([admin("me", "Me"), admin("o1", "Other")]);
    await screen.findByText("You");
    expect(screen.getAllByRole("button", { name: /^Remove$/ })).toHaveLength(1);
  });

  it("offers none when you are the only admin", async () => {
    await renderSettings([admin("me", "Me")]);
    await screen.findByText("You");
    expect(screen.queryByRole("button", { name: /^Remove$/ })).toBeNull();
  });
});

describe("Suggestions: Generate All progress (ADM-10 UI)", () => {
  it("shows the running job's progress, keeps the button off while it runs, and stops polling when done", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const job = { id: "j1", status: "running", startedAt: "2026-11-10T00:00:00Z", finishedAt: null, total: 10, eligible: 40, done: 3, created: 5, failed: 0 };
    let polls = 0;
    routeFetch([
      [/\/api\/admin\/suggestions\/generate/, () => {
        polls++;
        return json({ job: polls === 1 ? job : { ...job, status: "done", done: 10, finishedAt: "2026-11-10T00:01:00Z" } });
      }],
      [/\/api\/admin\/suggestions\?/, () => json({ suggestions: [], flags: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true }, rules: { minScore: 60, maxOpen: 10, weeklyCap: 0 } })],
    ]);
    await act(async () => {
      render(
        <ConfirmProvider>
          <AdminSuggestionsPage />
        </ConfirmProvider>,
      );
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Auto-Generate/ })));
    await waitFor(() => expect(document.body.textContent).toContain("3 of 10 members"), { timeout: 3000 });
    expect((screen.getByRole("button", { name: /Generate All Suggestions/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await waitFor(() => expect(document.body.textContent).toContain("10 of 10 members"));
    const after = polls;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(polls).toBe(after);
    expect((screen.getByRole("button", { name: /Generate All Suggestions/ }) as HTMLButtonElement).disabled).toBe(false);
    vi.useRealTimers();
  });
});
