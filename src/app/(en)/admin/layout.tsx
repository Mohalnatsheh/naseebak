import { auth } from "@/lib/auth";
import { AdminSidebar } from "@/components/shared/admin-sidebar";
import { AdminCountrySelect } from "@/components/admin/admin-country-select";
import { getCycleFlags } from "@/lib/settings";
import { getAdminCountry } from "@/lib/countries/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  if (!isAdmin) {
    return <>{children}</>;
  }

  const [{ introRequests }, country] = await Promise.all([getCycleFlags(), getAdminCountry()]);

  return (
    <div className="flex min-h-screen">
      <AdminSidebar legacyGrouped={introRequests} />
      <main className="flex-1 min-w-0 p-4 pt-20 sm:p-6 sm:pt-20 lg:p-8 lg:pt-6">
        {/* Country being managed: every admin list / stat API filters by it (settings stay global) */}
        <AdminCountrySelect current={country} />
        {/* Keyed by country: switching remounts the page, so its client-side fetches run again */}
        <div key={country}>{children}</div>
      </main>
    </div>
  );
}
