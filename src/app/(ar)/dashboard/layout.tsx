import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card">
        <nav className="container mx-auto flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="text-xl font-bold text-primary">
            نصيب
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard/profile" className="text-sm hover:text-primary transition">
              الملف الشخصي
            </Link>
            <Link href="/dashboard/suggestions" className="text-sm hover:text-primary transition">
              الاقتراحات
            </Link>
            <Link href="/dashboard/matches" className="text-sm hover:text-primary transition">
              التوافقات
            </Link>
            <Link href="/dashboard/notifications" className="text-sm hover:text-primary transition">
              الإشعارات
            </Link>
          </div>
        </nav>
      </header>
      <main className="flex-1 container mx-auto px-4 py-6">
        {children}
      </main>
      <footer className="border-t py-4 text-center text-sm text-muted-foreground">
        نصيب © {new Date().getFullYear()} - جميع الحقوق محفوظة
      </footer>
    </div>
  );
}
