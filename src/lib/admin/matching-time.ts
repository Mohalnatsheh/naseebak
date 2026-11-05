/** «in 3 d» / «in 5 h» / «in 20 min» until a deadline, «expired» once it passed, «—» without one */
export function fmtLeft(d: string | Date | null | undefined, now: Date = new Date()): string {
  if (!d) return "—";
  const min = Math.ceil((new Date(d).getTime() - now.getTime()) / 60000);
  if (min <= 0) return "expired";
  if (min < 60) return `in ${min} min`;
  const h = Math.ceil(min / 60);
  if (h < 48) return `in ${h} h`;
  return `in ${Math.ceil(h / 24)} d`;
}
