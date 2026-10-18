/** Push preference keys (columns of NotificationPreference). Kept db-free so mocks of notify.ts don't hide it. */
export type PreferenceKey =
  | "suggestions" | "interests" | "matches" | "visitUpdates" | "payments" | "identity" | "support"
  | "introRequests" | "chatMessages";

/**
 * Chat status notices (expiry, "2 days left", day-7 nudge, extended, ended, paused) are about the
 * match's next step, not a message: they follow «طلبات التعارف», so muting message pushes
 * («رسائل المحادثات») doesn't hide them. Only real message pushes use CHAT's own preference.
 */
export const CHAT_NOTICE_PREFERENCE: PreferenceKey = "introRequests";
