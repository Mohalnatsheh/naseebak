/**
 * Where a notification takes the user when clicked (in-app list and push).
 * A relative `metadata.url` set by the sender wins; otherwise the type decides.
 */
const TYPE_LINKS: Record<string, string> = {
  SUGGESTION: "/dashboard/suggestions",
  INTEREST: "/dashboard/suggestions",
  MATCH: "/dashboard/matches",
  VISIT_UPDATE: "/dashboard/matches",
  INTRO_REQUEST: "/dashboard/matches",
  CHAT: "/dashboard/chats",
  PAYMENT: "/dashboard/payments",
  SUBSCRIPTION: "/dashboard/payments",
  IDENTITY: "/dashboard",
  SUPPORT: "/dashboard/support",
  SYSTEM: "/dashboard",
};

export function notificationUrl(type: string, metadata?: unknown): string {
  if (metadata && typeof metadata === "object" && "url" in metadata) {
    const url = (metadata as { url?: unknown }).url;
    // Only same-site paths — never an absolute or protocol-relative URL
    if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//")) return url;
  }
  return TYPE_LINKS[type] ?? "/dashboard";
}
