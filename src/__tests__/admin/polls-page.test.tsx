import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ConfirmProvider } from "@/components/admin/confirm-dialog";
import AdminPollsPage from "@/app/(en)/admin/polls/page";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = () => ({ ok: false, status: 500, json: async () => ({ error: "Failed to load (500)" }) }) as Response;
const pollsBody = (polls: unknown[] = []) => ({ polls, adminCountry: "JO", enabled: true, roundDays: 5, rewardCredits: 2, creditsGiven: 7 });

async function renderPage() {
  await act(async () => {
    render(
      <ConfirmProvider>
        <AdminPollsPage />
      </ConfirmProvider>,
    );
  });
}

describe("admin polls after a failed load (ADM-04, review X2)", () => {
  it("shows no settings, switch or question form, so nothing can save the defaults; retry brings them", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(fail());
    await renderPage();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save settings/ })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText(/Publish now|Add to queue/)).toBeNull();
    expect(screen.queryByText(/Nothing is running/)).toBeNull();

    fetchMock.mockResolvedValueOnce(ok(pollsBody()));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Try again/ })));
    expect(await screen.findByRole("button", { name: /Save settings/ })).toBeTruthy();
    expect((screen.getByLabelText("Days per question") as HTMLInputElement).value).toBe("5");
    // Nothing runs in Jordan: saving publishes at once (ADM-02)
    expect(screen.getByRole("button", { name: /Publish now/ })).toBeTruthy();
  });

  it("with a question running, the button queues", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ok(pollsBody([{ id: "p1", slug: "s", country: "JO", question: "س", options: [], note: null, status: "ACTIVE", startedAt: null, endsAt: null, closedAt: null, createdAt: "2026-11-01T00:00:00Z", votes: 0, allVotes: 0 }])),
    );
    await renderPage();
    expect(await screen.findByRole("button", { name: /Add to queue/ })).toBeTruthy();
  });
});
