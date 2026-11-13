/**
 * The switch `chat_whatsapp_layout` picks the view: ChatList and ChatRoom render today's (classic) view by default
 * and the WhatsApp-style one only inside <ChatLayoutProvider layout="wa">. The data hooks are shared.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const hooks = vi.hoisted(() => ({ list: vi.fn(() => ({ list: "data" })), room: vi.fn(() => ({ room: "model" })) }));
vi.mock("@/components/chat/use-chat-list", () => ({ useChatList: hooks.list }));
vi.mock("@/components/chat/use-chat-room", () => ({ useChatRoom: hooks.room }));
vi.mock("@/components/chat/classic-chat-list", () => ({
  ClassicChatList: ({ compact, activeId }: { compact: boolean; activeId?: string | null }) => (
    <div data-testid="view">classic-list {String(compact)} {activeId}</div>
  ),
}));
vi.mock("@/components/chat/wa-chat-list", () => ({
  WaChatList: ({ compact, activeId }: { compact: boolean; activeId?: string | null }) => (
    <div data-testid="view">wa-list {String(compact)} {activeId}</div>
  ),
}));
vi.mock("@/components/chat/classic-chat-room", () => ({ ClassicChatRoom: () => <div data-testid="view">classic-room</div> }));
vi.mock("@/components/chat/wa-chat-room", () => ({ WaChatRoom: () => <div data-testid="view">wa-room</div> }));

import { ChatList } from "@/components/chat/chat-list";
import { ChatRoom } from "@/components/chat/chat-room";
import { ChatLayoutProvider } from "@/components/chat/chat-layout-context";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChatList picks its view", () => {
  it("classic by default", () => {
    render(<ChatList compact activeId="c1" />);
    expect(screen.getByTestId("view").textContent).toBe("classic-list true c1");
    expect(hooks.list).toHaveBeenCalled();
  });
  it("classic inside a classic provider", () => {
    render(
      <ChatLayoutProvider layout="classic">
        <ChatList />
      </ChatLayoutProvider>
    );
    expect(screen.getByTestId("view").textContent).toContain("classic-list");
  });
  it("WhatsApp-style inside <ChatLayoutProvider layout=\"wa\">", () => {
    render(
      <ChatLayoutProvider layout="wa">
        <ChatList compact activeId="c2" />
      </ChatLayoutProvider>
    );
    expect(screen.getByTestId("view").textContent).toBe("wa-list true c2");
  });
});

describe("ChatRoom picks its view", () => {
  it("classic by default", () => {
    render(<ChatRoom conversationId="c1" />);
    expect(screen.getByTestId("view").textContent).toBe("classic-room");
    expect(hooks.room).toHaveBeenCalledWith("c1");
  });
  it("WhatsApp-style inside <ChatLayoutProvider layout=\"wa\">", () => {
    render(
      <ChatLayoutProvider layout="wa">
        <ChatRoom conversationId="c1" />
      </ChatLayoutProvider>
    );
    expect(screen.getByTestId("view").textContent).toBe("wa-room");
  });
});
