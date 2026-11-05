import { db } from "@/lib/db";
import { byUserCountry, reportCountryWhere, type AdminCountry } from "@/lib/admin/country-filter";

/** What waits for an admin: the dashboard's «To do» and the sidebar badges (`/api/admin/today`) */
export async function adminTodo(country: AdminCountry) {
  const [reports, support, profileRequests, contactMessages, identity] = await Promise.all([
    db.report.count({ where: { ...reportCountryWhere(country), status: "PENDING" } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, ...byUserCountry(country, "user") } }),
    db.profileUpdateRequest.count({ where: { status: "PENDING", ...byUserCountry(country, "user") } }),
    db.contactMessage.count({ where: { handledAt: null, ...(country === "ALL" ? {} : { country }) } }),
    db.identityDoc.count({ where: { status: "PENDING", ...byUserCountry(country, "user") } }),
  ]);
  return { reports, support, profileRequests, contactMessages, identity };
}

export type AdminTodo = Awaited<ReturnType<typeof adminTodo>>;
