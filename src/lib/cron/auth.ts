import { timingSafeEqual } from "crypto";

/** `Authorization: Bearer ${CRON_SECRET}`. Always false when CRON_SECRET is not set. */
export function isCronAuthorized(request: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
