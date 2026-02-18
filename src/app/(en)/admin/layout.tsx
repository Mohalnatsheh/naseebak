import { auth } from "@/lib/auth";
import { AdminSidebar } from "@/components/shared/admin-sidebar";

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

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-6 lg:p-8 lg:pt-6 pt-16">
        {children}
      </main>
    </div>
  );
}
