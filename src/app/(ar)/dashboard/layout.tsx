import { DashboardSidebar } from "@/components/shared/dashboard-sidebar";
import { Providers } from "@/components/shared/providers";
import { OneSignalProvider } from "@/components/shared/onesignal-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <OneSignalProvider />
      <div className="flex min-h-screen" dir="rtl">
        <DashboardSidebar />
        <main className="flex-1 md:pt-0 pt-14">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
            {children}
          </div>
          <footer className="border-t py-4 text-center text-sm text-muted-foreground">
            نصيبك © {new Date().getFullYear()} - جميع الحقوق محفوظة
          </footer>
        </main>
      </div>
    </Providers>
  );
}
