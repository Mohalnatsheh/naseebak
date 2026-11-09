/**
 * Message reactions (db-free: the website imports it). One reaction per member per message; the same emoji
 * again removes it. Only in an open chat; a reaction makes no push and no unread count (chat/service.ts setReaction).
 */
export const REACTION_EMOJI = ["❤️", "👍", "😊", "🤲"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export type ChatReaction = { emoji: string; mine: boolean };

export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === "string" && (REACTION_EMOJI as readonly string[]).includes(value);
}

/** Stored rows → what one member sees: the emoji and whether it is theirs, never who else reacted */
export function reactionsFor(rows: readonly { emoji: string; userId: string }[] | null | undefined, viewerId: string): ChatReaction[] {
  return (rows ?? []).map((r) => ({ emoji: r.emoji, mine: r.userId === viewerId }));
}
