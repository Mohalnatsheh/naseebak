import type { Metadata } from "next";
import { DashboardSidebar } from "@/components/shared/dashboard-sidebar";
import { Providers } from "@/components/shared/providers";
import { OneSignalProvider } from "@/components/shared/onesignal-provider";
import { NotificationBar } from "@/components/shared/notification-bar";
import { OnboardingGuide } from "@/components/shared/onboarding-guide";
import { DashboardDataProvider } from "@/contexts/dashboard-context";
import { Toaster } from "@/components/ui/sonner";
import { DashboardFooter } from "@/components/shared/dashboard-footer";
import { sessionAccountGate } from "@/lib/auth";
import { DeactivatedGate } from "./reactivate/deactivated-gate";
import { SuspendedScreen } from "./suspended-screen";

// Each dashboard section sets its own title in its layout.tsx (pages here are client components)
export const metadata: Metadata = { title: { default: "لوحة التحكم", template: "%s | نصيبك" } };

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <div className="flex min-h-screen overflow-x-hidden">
          <DashboardSidebar />
          <main className="flex-1 md:pt-0 pt-[58px] pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 min-w-0">
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
              {/* Every page, until notifications are on (replaces the one-time popup) */}
              <NotificationBar />
              <OnboardingGuide />
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
