/** Midnight today in Amman (UTC+3 all year), as a UTC instant — for "once per day" limits */
export function startOfAmmanDay(now: Date): Date {
  const offset = 3 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}
