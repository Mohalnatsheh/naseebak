// Admin → Chats list: per-chat activity (last message, who wrote it, messages per person) and the
// filters / sort orders built on it. Pure helpers here; the route loads the rows.

export const CHAT_SORTS = ["last_message", "newest", "most_messages", "expiring"] as const;
export type ChatSort = (typeof CHAT_SORTS)[number];

/** Activity filters on top of the status filter */
export const CHAT_VIEWS = ["talking", "one_sided", "not_started", "expiring", "reported", "paused", "quiet"] as const;
export type ChatView = (typeof CHAT_VIEWS)[number];

export const EXPIRING_DAYS = 3;
/** «Quiet»: an open chat whose last message is older than this */
export const QUIET_HOURS = 48;
const HOUR = 60 * 60 * 1000;
export const REPORT_PAUSE = "system:report-review";

export interface ChatActivity {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  /** Effective status (ACTIVE past its expiry counts as EXPIRED) */
  status: "ACTIVE" | "ENDED" | "EXPIRED";
  endedByAdminId: string | null;
  messages: number;
  /** Messages per sender id */
  bySender: Record<string, number>;
  lastAt: Date | null;
  lastSenderId: string | null;
  reported: boolean;
}

export function matchesView(c: ChatActivity, view: ChatView, now: Date): boolean {
  const open = c.status === "ACTIVE";
  const speakers = Object.values(c.bySender).filter((n) => n > 0).length;
  switch (view) {
    case "talking":
      return speakers >= 2;
    case "one_sided":
      return speakers === 1;
    case "not_started":
      return c.messages === 0;
    case "expiring":
      return open && c.expiresAt.getTime() - now.getTime() <= EXPIRING_DAYS * 24 * HOUR;
    case "reported":
      return c.reported;
    case "paused":
      return c.endedByAdminId === REPORT_PAUSE;
    case "quiet":
      return open && c.messages > 0 && !!c.lastAt && now.getTime() - c.lastAt.getTime() > QUIET_HOURS * HOUR;
  }
}

/** Sort a copy; ties fall back to the newest chat first */
export function sortChats(rows: ChatActivity[], sort: ChatSort): ChatActivity[] {
  const newest = (a: ChatActivity, b: ChatActivity) => b.createdAt.getTime() - a.createdAt.getTime();
  const key: Record<ChatSort, (a: ChatActivity, b: ChatActivity) => number> = {
    // Chats with no message go last, newest first among them
    last_message: (a, b) => (b.lastAt?.getTime() ?? -Infinity) - (a.lastAt?.getTime() ?? -Infinity),
    newest: () => 0,
    most_messages: (a, b) => b.messages - a.messages,
    // Open chats closest to their end first; closed chats after
    expiring: (a, b) =>
      (a.status === "ACTIVE" ? a.expiresAt.getTime() : Infinity) - (b.status === "ACTIVE" ? b.expiresAt.getTime() : Infinity),
  };
  return [...rows].sort((a, b) => key[sort](a, b) || newest(a, b));
}

/** Counts for the summary bar, over every chat */
export function chatSummary(rows: ChatActivity[], now: Date) {
  const day = now.getTime() - 24 * HOUR;
  const open = rows.filter((c) => c.status === "ACTIVE");
  return {
    open: open.length,
    talkedToday: rows.filter((c) => c.lastAt && c.lastAt.getTime() > day).length,
    notStarted: open.filter((c) => matchesView(c, "not_started", now)).length,
    oneSided: open.filter((c) => matchesView(c, "one_sided", now)).length,
    quiet: open.filter((c) => matchesView(c, "quiet", now)).length,
    expiring: open.filter((c) => matchesView(c, "expiring", now)).length,
    reported: rows.filter((c) => c.reported).length,
  };
}

/** Message count per (chat, sender), as `message.groupBy` returns it */
export interface SenderCountRow {
  conversationId: string;
  senderId: string;
  _count: { _all: number };
}

/** Latest message per chat (`DISTINCT ON`) */
export interface LastMessageRow {
  conversationId: string;
  senderId: string;
  createdAt: Date | string;
}

/**
 * Activity per chat, for exactly the chats in `chats`. Rows for other chats are ignored, so the
 * message queries may be limited to these chat ids (the route does that) without changing anything.
 */
export function buildChatActivity(
  chats: { id: string; status: string; createdAt: Date; expiresAt: Date; endedByAdminId: string | null }[],
  perSender: SenderCountRow[],
  lastRows: LastMessageRow[],
  reportedIds: Iterable<string | null>,
  effectiveStatus: (c: { status: string; expiresAt: Date }) => string,
): Map<string, ChatActivity> {
  const reported = new Set(reportedIds);
  const last = new Map(lastRows.map((r) => [r.conversationId, r]));
  const senders = new Map<string, Record<string, number>>();
  for (const r of perSender) {
    const m = senders.get(r.conversationId) ?? {};
    m[r.senderId] = r._count._all;
    senders.set(r.conversationId, m);
  }
  return new Map(
    chats.map((c) => {
      const bySender = senders.get(c.id) ?? {};
      const l = last.get(c.id);
      return [
        c.id,
        {
          id: c.id,
          createdAt: c.createdAt,
          expiresAt: c.expiresAt,
          status: effectiveStatus(c) as ChatActivity["status"],
          endedByAdminId: c.endedByAdminId,
          messages: Object.values(bySender).reduce((a, b) => a + b, 0),
          bySender,
          lastAt: l ? new Date(l.createdAt) : null,
          lastSenderId: l?.senderId ?? null,
          reported: reported.has(c.id),
        },
      ];
    }),
  );
}

/** Who ended a chat, as the admin pages show it: «paused» (report review), «system», «admin», the member's first name, or null */
export function chatEndedBy(
  c: { endedByAdminId: string | null; endedById: string | null },
  people: { id: string; firstName: string }[],
): string | null {
  if (c.endedByAdminId) {
    if (c.endedByAdminId === REPORT_PAUSE) return "paused";
    return c.endedByAdminId.startsWith("system:") ? "system" : "admin";
  }
  if (c.endedById) return people.find((p) => p.id === c.endedById)?.firstName ?? "user";
  return null;
}
