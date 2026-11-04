/** `Payment.failureReason` kinds and their admin labels (no server code: the admin page imports this). See failure.ts. */
export const FAILURE_REASONS = ["DECLINED", "CANCELLED", "EXPIRED", "ASYNC_FAILED", "NOT_PAID"] as const;

/** Admin labels; DECLINED:<code> shows the code next to it */
export const FAILURE_LABELS: Record<(typeof FAILURE_REASONS)[number], string> = {
  DECLINED: "Card declined",
  CANCELLED: "Cancelled by the member",
  EXPIRED: "Checkout left open (expired)",
  ASYNC_FAILED: "Delayed payment failed",
  NOT_PAID: "Closed without paying",
};
