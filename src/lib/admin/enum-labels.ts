/**
 * Readable English display labels for the enum values the admin panel shows
 * (filters, badges, table cells). Display only: the raw enum values are still
 * what is sent to and received from the APIs.
 *
 * The same value can mean different things per model (PENDING user vs PENDING
 * request), so labels are grouped by domain. Use `enumLabel(group, value)`;
 * unknown values fall back to the raw value so nothing ever renders blank.
 */

export const ENUM_LABELS = {
  userStatus: {
    PENDING: "Under review",
    VERIFIED: "Verified",
    REJECTED: "Rejected",
    SUSPENDED: "Suspended",
    FLAGGED: "Flagged",
  },
  identityStatus: {
    PENDING: "Under review",
    APPROVED: "Approved",
    REJECTED: "Rejected",
  },
  suggestionStatus: {
    PENDING: "Awaiting reply",
    ACCEPTED: "Accepted",
    REJECTED: "Rejected",
    EXPIRED: "Expired",
  },
  suggestionSource: {
    AI: "Automatic",
    ADMIN: "Admin",
  },
  introType: {
    FAMILY: "Family",
    CHAT: "Chat",
  },
  /** Intro (family/chat) requests and chats, incl. effective statuses from cycle-stats. */
  requestStatus: {
    PENDING: "Awaiting reply",
    ACCEPTED: "Accepted",
    DECLINED: "Declined",
    EXPIRED: "Expired",
    CANCELLED: "Cancelled",
    ACTIVE: "Active",
    ENDED: "Ended",
  },
  chatStatus: {
    ACTIVE: "Active",
    ENDED: "Ended",
    EXPIRED: "Expired",
  },
  visitStatus: {
    REQUESTED: "Requested",
    FAMILIES_CONTACTED: "Families contacted",
    SCHEDULED: "Scheduled",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  },
  paymentStatus: {
    PENDING: "Pending",
    COMPLETED: "Completed",
    FAILED: "Failed",
    REFUNDED: "Refunded",
  },
  paymentProvider: {
    EFAWATEERCOM: "eFawateercom",
    PAYPAL: "PayPal",
    STRIPE: "Stripe",
  },
  blogPostStatus: {
    DRAFT: "Draft",
    PUBLISHED: "Published",
  },
  ticketType: {
    ISSUE: "Issue",
    SUGGESTION: "Suggestion",
    CHANGE_REQUEST: "Change request",
  },
  ticketStatus: {
    OPEN: "Open",
    IN_PROGRESS: "In progress",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
  },
  reportReason: {
    FAKE_PROFILE: "Fake profile",
    INAPPROPRIATE_CONTENT: "Inappropriate content",
    HARASSMENT: "Harassment",
    SPAM: "Spam",
    OTHER: "Other",
  },
  reportStatus: {
    PENDING: "Pending",
    REVIEWED: "Reviewed",
    DISMISSED: "Dismissed",
  },
} as const satisfies Record<string, Record<string, string>>;

export type EnumLabelGroup = keyof typeof ENUM_LABELS;

/** Display label for an enum value; falls back to the raw value when unmapped. */
export function enumLabel(group: EnumLabelGroup, value: string | null | undefined): string {
  if (!value) return "";
  return (ENUM_LABELS[group] as Record<string, string>)[value] ?? value;
}
