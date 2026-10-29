/**
 * Prisma `where` parts for the admin's selected country (cookie `admin_country`, read with
 * `getAdminCountry(request)` from src/lib/countries/server.ts). "ALL" always gives `{}` so nothing
 * is filtered — not even rows whose member was deleted (an empty relation filter would drop them).
 * Members are only ever paired within one country, so for pairs (suggestions, matches, chats,
 * introductions, visits) one side is enough.
 */
import type { Prisma } from "@prisma/client";
import { DEFAULT_COUNTRY, countryConfig } from "@/lib/countries";
import { userCountryWhere, type AdminCountry } from "@/lib/countries/server";

export { getAdminCountry, userCountryWhere, type AdminCountry } from "@/lib/countries/server";

/** `{ [relation]: { country } }` on a required User relation, `{}` for ALL */
export function byUserCountry<K extends string>(country: AdminCountry, relation: K): Partial<Record<K, { country: string }>> {
  if (country === "ALL") return {};
  return { [relation]: { country } } as Partial<Record<K, { country: string }>>;
}

/** Mutual matches of the country (both people are always from the same country) */
export function matchCountryWhere(country: AdminCountry): Prisma.MutualMatchWhereInput {
  return country === "ALL" ? {} : { female: userCountryWhere(country) };
}

/**
 * Payments of the country. A payment whose member was deleted (`userId` null) is placed by its
 * currency (JOD → Jordan, SAR → Saudi Arabia).
 */
export function paymentCountryWhere(country: AdminCountry): Prisma.PaymentWhereInput {
  if (country === "ALL") return {};
  return { OR: [{ user: { country } }, { userId: null, currency: countryConfig(country).currency.code }] };
}

/**
 * Reports by the reported member's country; a report whose reported member was deleted falls back
 * to the reporter's country, and one with both deleted shows under the default country (Jordan).
 */
export function reportCountryWhere(country: AdminCountry): Prisma.ReportWhereInput {
  if (country === "ALL") return {};
  return {
    OR: [
      { reported: { country } },
      { reportedId: null, reporter: { country } },
      ...(country === DEFAULT_COUNTRY ? [{ reportedId: null, reporterId: null }] : []),
    ],
  };
}
