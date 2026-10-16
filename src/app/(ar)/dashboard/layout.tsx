import { DashboardSidebar } from "@/components/shared/dashboard-sidebar";
import { Providers } from "@/components/shared/providers";
import { OneSignalProvider } from "@/components/shared/onesignal-provider";
import { PushPermissionPrompt } from "@/components/shared/push-permission-prompt";
import { OnboardingGuide } from "@/components/shared/onboarding-guide";
import { DashboardDataProvider } from "@/contexts/dashboard-context";
import { Toaster } from "@/components/ui/sonner";
import { DashboardFooter } from "@/components/shared/dashboard-footer";
import { isSessionUserDeactivated } from "@/lib/auth";
import { DeactivatedGate } from "./reactivate/deactivated-gate";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Deactivated accounts (paused or pending deletion) only see /dashboard/reactivate
  if (await isSessionUserDeactivated()) {
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
          <main className="flex-1 md:pt-0 pt-[58px] min-w-0">
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
              <PushPermissionPrompt />
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
