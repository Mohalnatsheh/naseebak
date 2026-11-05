import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAdminCountry } from "@/lib/admin/country-filter";
import { csvResponse } from "@/lib/admin/csv";
import { paymentsListWhere } from "@/lib/admin/list-filters";
import { findAnyPackage } from "@/lib/payments/packages";

const MAX_ROWS = 20000;

/** Payments list as CSV, with the filters on screen. Phone numbers leave the site here, so each download is logged */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const params = new URL(request.url).searchParams;
    const payments = await db.payment.findMany({
      where: paymentsListWhere(params, await getAdminCountry(request), new Date()),
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      select: {
        planName: true, amount: true, currency: true, status: true, failureReason: true, disputedAt: true, createdAt: true,
        user: { select: { firstName: true, lastName: true, phone: true, country: true } },
      },
    });
    console.info(`[admin] payments export by ${result.session.user.id}: ${payments.length} rows (${params.toString() || "no filter"})`);
    return csvResponse(`naseebak-payments-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Date", "Member", "Phone", "Country", "Package", "Amount", "Currency", "Status", "Failure reason", "Disputed"],
      ...payments.map((p) => [
        p.createdAt.toISOString(),
        p.user ? `${p.user.firstName} ${p.user.lastName}` : "Deleted account",
        p.user?.phone,
        p.user?.country,
        findAnyPackage(p.planName)?.name ?? p.planName,
        Number(p.amount),
        p.currency,
        p.status,
        p.failureReason,
        p.disputedAt ? "Yes" : "No",
      ]),
    ]);
  } catch (error) {
    console.error("Admin payments export error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
