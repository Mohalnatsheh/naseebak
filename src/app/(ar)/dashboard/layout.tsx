import type { Metadata } from "next";
import { DashboardSidebar } from "@/components/shared/dashboard-sidebar";
import { Providers } from "@/components/shared/providers";
import { OneSignalProvider } from "@/components/shared/onesignal-provider";
import { NotificationBar } from "@/components/shared/notification-bar";
import { AlertPopup } from "@/components/shared/alert-popup";
import { DashboardDataProvider } from "@/contexts/dashboard-context";
import { Toaster } from "@/components/ui/sonner";
import { DashboardFooter } from "@/components/shared/dashboard-footer";
import { MemberCountryAnalytics, VisitorCountryProvider } from "@/components/shared/visitor-country";
import { currentSession, sessionAccountGate } from "@/lib/auth";
import { db } from "@/lib/db";
import { toCountry } from "@/lib/countries";
import { getVisitorCountry } from "@/lib/countries/server";
import { activeCountryCodes } from "@/lib/countries/settings";
import { DeactivatedGate } from "./reactivate/deactivated-gate";
import { SuspendedScreen } from "./suspended-screen";

// Each dashboard section sets its own title in its layout.tsx (pages here are client components)
export const metadata: Metadata = {
  title: { default: "لوحة التحكم", template: "%s | نصيبك" },
  robots: { index: false, follow: false },
};

/** Inside the dashboard the country is the member's own, whatever public page they saw last */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  const user = session?.user?.id ? await db.user.findUnique({ where: { id: session.user.id }, select: { country: true } }) : null;
  const [visitor, countries] = await Promise.all([getVisitorCountry(), activeCountryCodes()]);
  return (
    <VisitorCountryProvider country={user ? toCountry(user.country) : visitor} countries={countries}>
      <MemberCountryAnalytics />
      <DashboardShell>{children}</DashboardShell>
    </VisitorCountryProvider>
  );
}

async function DashboardShell({ children }: { children: React.ReactNode }) {
  const gate = await sessionAccountGate();

  // Suspended accounts: every user API refuses them, so show one explanation instead of empty pages
  if (gate === "suspended") {
    return (
      <Providers>
        <main className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
          <SuspendedScreen />
        </main>
      </Providers>
    );
  }

  // Deactivated accounts (paused or pending deletion) only see /dashboard/reactivate
  if (gate === "deactivated") {
    return (
      <Providers>
        <main className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
              <DeactivatedGate>{children}</DeactivatedGate>
        </main>
        <Toaster position="top-center" dir="rtl" richColors closeButton />
      </Providers>
    );
  }

  return (
    <Providers>
      <OneSignalProvider />
      <DashboardDataProvider>
        <div className={`flex min-h-screen overflow-x-hidden`}>
          <DashboardSidebar />
          <main className="flex-1 md:pt-0 pt-[58px] pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 min-w-0">
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
              {/* Every page, until notifications are on (replaces the one-time popup) */}
              <NotificationBar />
              {/* The admin's popup alert, once per member (admin → Popup Alerts) */}
              <AlertPopup />
              {children}
            </div>
            <DashboardFooter />
          </main>
        </div>
        <Toaster position="top-center" dir="rtl" richColors closeButton />
      </DashboardDataProvider>
    </Providers>
  );
}
