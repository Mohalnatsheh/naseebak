/**
 * A small in-memory stand-in for the Prisma calls Pro makes, for tests that follow money over many events
 * (ordering, repeats, years). Rows come back as copies, like Prisma's; unique `ProCreditGrant.key` throws P2002.
 */
import { Prisma } from "@prisma/client";

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

const copy = (r: Row | undefined) => (r ? { ...r } : null);
const cmp = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() - b.getTime() : Number(a) - Number(b));

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const op = v as Record<string, unknown>;
      if ("in" in op && !(op.in as unknown[]).includes(row[k])) return false;
      if ("not" in op && row[k] === op.not) return false;
      if ("lt" in op && !(row[k] != null && cmp(row[k], op.lt) < 0)) return false;
      if ("lte" in op && !(row[k] != null && cmp(row[k], op.lte) <= 0)) return false;
      if ("gt" in op && !(row[k] != null && cmp(row[k], op.gt) > 0)) return false;
      return true;
    }
    return row[k] === v;
  });
}

function apply(row: Row, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !(v instanceof Date) && "increment" in (v as object)) row[k] = Number(row[k] ?? 0) + (v as { increment: number }).increment;
    else row[k] = v;
  }
}

function sorted(rows: Row[], orderBy?: Record<string, "asc" | "desc">) {
  if (!orderBy) return rows;
  const [[k, dir]] = Object.entries(orderBy);
  return [...rows].sort((a, b) => (dir === "asc" ? 1 : -1) * cmp(a[k], b[k]));
}

export function createFakeDb(clock: () => Date = () => new Date()) {
  const store = { subs: [] as Row[], payments: [] as Row[], grants: [] as Row[], users: [] as Row[], ledger: [] as Row[] };
  let seq = 0;
  let tick = 0;

  function table(rows: () => Row[], prefix: string, defaults: () => Record<string, unknown>, unique?: string) {
    return {
      findFirst: async (a: { where?: Where; orderBy?: Record<string, "asc" | "desc"> }) => copy(sorted(rows().filter((r) => matches(r, a.where)), a.orderBy)[0]),
      findUnique: async (a: { where: Where }) => copy(rows().find((r) => matches(r, a.where))),
      findMany: async (a: { where?: Where; orderBy?: Record<string, "asc" | "desc">; take?: number } = {}) =>
        sorted(rows().filter((r) => matches(r, a.where)), a.orderBy).slice(0, a.take ?? Infinity).map((r) => ({ ...r })),
      count: async (a: { where?: Where } = {}) => rows().filter((r) => matches(r, a.where)).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (unique && rows().some((r) => r[unique] === data[unique])) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "test" });
        }
        const row = { id: `${prefix}${++seq}`, ...defaults(), ...data } as Row;
        rows().push(row);
        return copy(row)!;
      },
      update: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const row = rows().find((r) => matches(r, where));
        if (!row) throw new Error(`${prefix}: not found`);
        apply(row, data);
        return copy(row)!;
      },
      updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const hit = rows().filter((r) => matches(r, where));
        for (const r of hit) apply(r, data);
        return { count: hit.length };
      },
    };
  }

  // createdAt strictly increases, so "latest" is well defined even within one test millisecond
  const stamp = () => ({ createdAt: new Date(clock().getTime() + ++tick) });
  const db = {
    proSubscription: table(() => store.subs, "ps", () => ({ ...stamp(), grantsMade: 0, cancelAtPeriodEnd: false, nextCreditGrantAt: null, endedAt: null })),
    payment: table(() => store.payments, "pm", stamp),
    proCreditGrant: table(() => store.grants, "g", () => ({ ...stamp(), takenBack: false }), "key"),
    user: table(() => store.users, "u", stamp),
    creditLedger: table(() => store.ledger, "l", stamp),
    $executeRaw: async () => 1,
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      // All or nothing, like a real transaction
      const before = structuredClone(store);
      try {
        return await fn(db);
      } catch (e) {
        Object.assign(store, before);
        throw e;
      }
    },
  };
  return { db, store };
}
