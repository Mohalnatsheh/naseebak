/**
 * Pure helpers for the admin views of the new user cycle.
 * Requests, shared suggestions and chats expire lazily, so the stored status can still say
 * PENDING/ACTIVE after the expiry date — these helpers give the status the user actually sees.
 */

type DateLike = Date | string | null;

function isPast(d: DateLike, now: Date): boolean {
  return d != null && new Date(d).getTime() < now.getTime();
}

/** Intro requests and MUTUAL suggestions: PENDING past `expiresAt` → EXPIRED. */
export function effectiveRequestStatus(
  row: { status: string; expiresAt: DateLike },
  now: Date = new Date()
): string {
  return row.status === "PENDING" && isPast(row.expiresAt, now) ? "EXPIRED" : row.status;
}

/** Conversations: ACTIVE past `expiresAt` → EXPIRED. */
export function effectiveConversationStatus(
  row: { status: string; expiresAt: DateLike },
  now: Date = new Date()
): string {
  return row.status === "ACTIVE" && isPast(row.expiresAt, now) ? "EXPIRED" : row.status;
}

export interface RequestCounts {
  sent: number;
  pending: number;
  accepted: number;
  declined: number;
  expired: number;
  cancelled: number;
}

const emptyCounts = (): RequestCounts => ({ sent: 0, pending: 0, accepted: 0, declined: 0, expired: 0, cancelled: 0 });

export function summarizeIntroRequests(
  rows: { type: "FAMILY" | "CHAT"; status: string; expiresAt: DateLike }[],
  now: Date = new Date()
): Record<"FAMILY" | "CHAT" | "ALL", RequestCounts> {
  const out = { FAMILY: emptyCounts(), CHAT: emptyCounts(), ALL: emptyCounts() };
  for (const row of rows) {
    const key = effectiveRequestStatus(row, now).toLowerCase() as keyof RequestCounts;
    for (const bucket of [out[row.type], out.ALL]) {
      bucket.sent++;
      if (key in bucket && key !== "sent") bucket[key]++;
    }
  }
  return out;
}

export interface FunnelCounts {
  registered: number;
  profileReady: number;
  gotSuggestions: number;
  matched: number;
  introAccepted: number;
}

const FUNNEL_LABELS: [keyof FunnelCounts, string][] = [
  ["registered", "Registered"],
  ["profileReady", "Profile ready"],
  ["gotSuggestions", "Got suggestions"],
  ["matched", "Mutual match"],
  ["introAccepted", "Introduction accepted"],
];

export function buildFunnel(counts: FunnelCounts): { key: keyof FunnelCounts; label: string; count: number; pct: number }[] {
  return FUNNEL_LABELS.map(([key, label]) => ({
    key,
    label,
    count: counts[key],
    pct: counts.registered > 0 ? Math.round((counts[key] / counts.registered) * 100) : 0,
  }));
}
