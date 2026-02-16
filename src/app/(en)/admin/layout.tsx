import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-card p-4 space-y-4">
        <h2 className="text-lg font-bold text-primary">Naseeb Admin</h2>
        <nav className="space-y-2">
          <Link href="/admin" className="block rounded-md px-3 py-2 text-sm hover:bg-muted transition">
            Dashboard
          </Link>
          <Link href="/admin/users" className="block rounded-md px-3 py-2 text-sm hover:bg-muted transition">
            Users
          </Link>
          <Link href="/admin/identity" className="block rounded-md px-3 py-2 text-sm hover:bg-muted transition">
            Identity Verification
          </Link>
          <Link href="/admin/suggestions" className="block rounded-md px-3 py-2 text-sm hover:bg-muted transition">
            Suggestions
          </Link>
          <Link href="/admin/visits" className="block rounded-md px-3 py-2 text-sm hover:bg-muted transition">
            Visit Requests
          </Link>
        </nav>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Admin Panel</h1>
          <span className="text-sm text-muted-foreground">Admin User</span>
        </header>
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
