/** Safe query-param parsing for admin list routes: bad values are ignored, never a 500. */

export function safePagination(searchParams: URLSearchParams, pageSize = 20) {
  const raw = parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isFinite(raw) && raw >= 1 ? raw : 1;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** Returns the value when it is one of `allowed`, otherwise undefined. */
export function enumParam<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Prisma unique-constraint error (e.g. a duplicate slug saved concurrently) → answer 409, not 500. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
