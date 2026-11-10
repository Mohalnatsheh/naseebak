import { describe, it, expect, vi } from "vitest";
import { Suspense } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ConfirmProvider } from "@/components/admin/confirm-dialog";
import AdminChatPage from "@/app/(en)/admin/chats/[id]/page";

const people = [
  { id: "f", firstName: "سلمى", lastName: "أ" },
  { id: "m", firstName: "ماجد", lastName: "ب" },
];

function chatResponse(n: number, reportedIndex?: number) {
  const messages = Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    senderId: i % 2 ? "m" : "f",
    body: `msg ${i}`,
    readAt: null,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
    kind: "TEXT",
    media: null,
  }));
  return {
    chat: {
      id: "c1", matchId: "x", people, status: "ACTIVE", createdAt: messages[0]?.createdAt, expiresAt: "2026-12-01T00:00:00Z",
      extended: false, endedAt: null, endedBy: null,
      reports: reportedIndex === undefined ? [] : [{ id: "r1", status: "PENDING", createdAt: "2026-11-02T00:00:00Z", messageId: `m${reportedIndex}` }],
    },
    messages,
    truncated: false,
  };
}

/** The paged API (X1, ADM-26): ?limit=N newest, &before=<id> the N just older */
async function renderPage(body: ReturnType<typeof chatResponse>) {
  const all = body.messages;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input), "http://x");
    const limit = Number(url.searchParams.get("limit") ?? 3000);
    const before = url.searchParams.get("before");
    const end = before ? all.findIndex((m) => m.id === before) : all.length;
    const from = Math.max(0, end - limit);
    const page = all.slice(from, end);
    return {
      ok: true,
      status: 200,
      json: async () => ({ ...body, messages: page, hasMore: from > 0, nextBefore: from > 0 ? page[0].id : null }),
    } as Response;
  });
  Element.prototype.scrollIntoView = vi.fn();
  await act(async () => {
    render(
      <ConfirmProvider>
        <Suspense>
          <AdminChatPage params={Promise.resolve({ id: "c1" })} />
        </Suspense>
      </ConfirmProvider>,
    );
  });
}

describe("admin chat detail (ADM-26, design P2)", () => {
  it("draws the newest 200 messages and loads older on demand", async () => {
    await renderPage(chatResponse(450));
    expect(await screen.findByText("msg 449")).toBeTruthy();
    expect(screen.queryByText("msg 0")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Load older/ })));
    expect(await screen.findByText("msg 50")).toBeTruthy();
    expect(screen.queryByText("msg 49")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Load older/ })));
    expect(await screen.findByText("msg 0")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Load older/ })).toBeNull();
  });

  it("the reported-message chip brings an older reported message into view", async () => {
    await renderPage(chatResponse(450, 3));
    await screen.findByText("msg 449");
    expect(screen.queryByText("msg 3")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Reported message/ })));
    expect(await screen.findByText("msg 3")).toBeTruthy();
  });

  it("an ended chat names who ended it, never «[object Object]»", async () => {
    const body = chatResponse(2);
    body.chat = { ...body.chat, status: "ENDED", endedAt: "2026-11-10T10:00:00Z", endedBy: "سلمى" } as typeof body.chat;
    await renderPage(body);
    await screen.findByText("msg 1");
    expect(document.body.textContent).not.toContain("[object Object]");
    expect(document.body.textContent).toContain("by سلمى");
  });

  it("names are isolated in the header counts", async () => {
    await renderPage(chatResponse(3));
    await screen.findByText("msg 2");
    const bdis = Array.from(document.querySelectorAll("bdi")).map((b) => b.textContent);
    expect(bdis).toContain("سلمى");
    expect(bdis).toContain("ماجد");
  });
});
