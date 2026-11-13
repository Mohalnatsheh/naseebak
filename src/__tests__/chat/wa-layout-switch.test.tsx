import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const rows = vi.hoisted(() => ({ value: {} as Record<string, string> }));
const db = vi.hoisted(() => ({
  systemSetting: {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
      where.key in rows.value ? { key: where.key, value: rows.value[where.key] } : null
    ),
    upsert: vi.fn(async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
      rows.value[where.key] = update.value;
    }),
  },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));
vi.mock("@/lib/suggestions/mutual", () => ({ closeLegacyInFlight: vi.fn() }));

import { getChatWhatsappLayout, setSetting } from "@/lib/settings";
import { ChatLayoutProvider, useChatLayout } from "@/components/chat/chat-layout-context";
import { GET, PATCH } from "@/app/api/admin/settings/new-cycle/route";

function Probe() {
  return <span data-testid="layout">{useChatLayout()}</span>;
}

beforeEach(async () => {
  // setSetting also drops the 30s cache entry, so each test starts from the default
  rows.value = {};
  await setSetting("chat_whatsapp_layout", "false");
  rows.value = {};
  vi.clearAllMocks();
});

describe("getChatWhatsappLayout", () => {
  it("is false with no row", async () => {
    expect(await getChatWhatsappLayout()).toBe(false);
  });
  it("is true for \"true\"", async () => {
    await setSetting("chat_whatsapp_layout", "true");
    expect(await getChatWhatsappLayout()).toBe(true);
  });
});

describe("useChatLayout", () => {
  it("is classic with no provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("layout")).toHaveTextContent("classic");
  });
  it("follows the provider", () => {
    render(
      <ChatLayoutProvider layout="wa">
        <Probe />
      </ChatLayoutProvider>
    );
    expect(screen.getByTestId("layout")).toHaveTextContent("wa");
  });
});

describe("admin new-cycle route", () => {
  it("GET reports chatWhatsappLayout false by default", async () => {
    const res = await GET();
    expect((await res.json()).chatWhatsappLayout).toBe(false);
  });
  it("PATCH saves the switch", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/admin/settings/new-cycle", {
        method: "PATCH",
        body: JSON.stringify({ chatWhatsappLayout: true }),
      })
    );
    expect(db.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "chat_whatsapp_layout" }, update: { value: "true" } })
    );
    expect((await res.json()).chatWhatsappLayout).toBe(true);
  });
});
