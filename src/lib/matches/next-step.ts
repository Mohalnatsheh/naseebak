/**
 * One match's next step for the viewer, for the matches list (the app shows it on each tile; QA round 2 design
 * review: «the matches list shows each match's next step»). Additive and read-only: the match page still decides
 * what can be done. Null when the match is closed or nothing is waiting.
 *
 * - reply_family / reply_chat: the partner asked (a request waits for my answer)
 * - waiting_family / waiting_chat: I asked, the partner hasn't answered yet
 * - chat_open: the chat is running
 * - family_accepted: the family introduction was accepted (the families have each other's contacts)
 * - choose: nothing under way yet, I can choose family or chat (`actionable` of `describeMatch`)
 */
export type MatchNextStep =
  | "reply_family"
  | "reply_chat"
  | "waiting_family"
  | "waiting_chat"
  | "chat_open"
  | "family_accepted"
  | "choose";

export interface NextStepFacts {
  viewerId: string;
  closed: string | null;
  actionable: boolean;
  requests: { type: string; status: string; expiresAt: Date; senderId?: string | null }[];
  conversation: { status: string; expiresAt: Date } | null;
}

export function matchNextStep(f: NextStepFacts, now = new Date()): MatchNextStep | null {
  if (f.closed) return null;
  const pending = (type: string) =>
    f.requests.find((r) => r.type === type && r.status === "PENDING" && r.expiresAt > now);
  for (const type of ["FAMILY", "CHAT"] as const) {
    const r = pending(type);
    if (r && r.senderId && r.senderId !== f.viewerId) return type === "FAMILY" ? "reply_family" : "reply_chat";
  }
  if (f.conversation && f.conversation.status === "ACTIVE" && f.conversation.expiresAt > now) return "chat_open";
  if (f.requests.some((r) => r.type === "FAMILY" && r.status === "ACCEPTED")) return "family_accepted";
  for (const type of ["FAMILY", "CHAT"] as const) {
    const r = pending(type);
    if (r && r.senderId === f.viewerId) return type === "FAMILY" ? "waiting_family" : "waiting_chat";
  }
  return f.actionable ? "choose" : null;
}
