import type { PaymentStatus, Prisma } from "@prisma/client";
import { enumParam } from "@/lib/admin/query";
import { paymentCountryWhere, userCountryWhere, type AdminCountry } from "@/lib/admin/country-filter";
import { personSearch } from "@/lib/admin/search";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_STATUSES: PaymentStatus[] = ["PENDING", "COMPLETED", "FAILED", "REFUNDED"];

/** Sort choices of the Users list, newest sign-ups by default; a tie keeps the same order between pages */
export const USER_SORTS: Record<string, Prisma.UserOrderByWithRelationInput[]> = {
  joined: [{ createdAt: "desc" }, { id: "asc" }],
  lastActive: [{ lastActiveAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
  credits: [{ matchCredits: "desc" }, { createdAt: "desc" }, { id: "asc" }],
};

/** The Users list's filters, shared by the page and its CSV download */
export function usersListWhere(params: URLSearchParams, country: AdminCountry): Prisma.UserWhereInput {
  const search = (params.get("search") || "").trim();
  const gender = params.get("gender") || "";
  const status = params.get("status") || "";
  const uses = params.get("uses") || "";
  const credits = params.get("credits") || "";

  // Admin's selected country ("ALL" = every country)
  const where: Prisma.UserWhereInput = { ...userCountryWhere(country) };

  if (search) {
    // Name / phone (personSearch), email, or a user id pasted from a log
    where.OR = [
      ...(personSearch(search)?.OR as Prisma.UserWhereInput[]),
      { email: { contains: search, mode: "insensitive" } },
      { id: search },
    ];
  }

  if (gender === "MALE" || gender === "FEMALE") {
    where.gender = gender;
  }

  // App users = signed in to the app at least once; website only = never
  if (uses === "app") where.mobileSessions = { some: {} };
  else if (uses === "web") where.mobileSessions = { none: {} };

  if (status === "FLAGGED") where.isFlagged = true;
  else if (status === "SUSPENDED") where.status = status;

  if (credits === "zero") where.matchCredits = 0;
  return where;
}

/** The Payments list's filters, shared by the page and its CSV download */
export function paymentsListWhere(params: URLSearchParams, country: AdminCountry, now: Date): Prisma.PaymentWhereInput {
  // Unknown status values are ignored (all payments) instead of a Prisma 500; DISPUTED is a filter of its own
  const status = enumParam(params.get("status"), PAYMENT_STATUSES);
  const disputed = params.get("status") === "DISPUTED";
  // One line of «Why payments failed»; UNKNOWN = not filled in
  const reason = params.get("reason");
  const member = personSearch(params.get("search"));
  return {
    // A deleted member's payment is placed by its currency
    ...paymentCountryWhere(country),
    ...(status ? { status } : {}),
    ...(disputed ? { disputedAt: { not: null } } : {}),
    ...(member ? { user: member } : {}),
    ...(reason ? { status: "FAILED" as const, failureReason: reason === "UNKNOWN" ? null : reason } : {}),
    // «All» leaves out checkouts abandoned over a day ago: nothing will happen to them (the Pending filter still shows them)
    ...(!status && !disputed && !reason ? { NOT: { status: "PENDING" as const, createdAt: { lt: new Date(now.getTime() - DAY_MS) } } } : {}),
  };
}
