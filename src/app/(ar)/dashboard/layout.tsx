import type { Metadata } from "next";
import { DashboardSidebar } from "@/components/shared/dashboard-sidebar";
import { Providers } from "@/components/shared/providers";
import { OneSignalProvider } from "@/components/shared/onesignal-provider";
import { DashboardColumn } from "@/components/shared/banner-slot";
import { AlertPopup } from "@/components/shared/alert-popup";
import { DashboardDataProvider } from "@/contexts/dashboard-context";
import { Toaster } from "@/components/ui/sonner";
import { DashboardFooter } from "@/components/shared/dashboard-footer";
import { MemberCountryAnalytics, VisitorCountryProvider } from "@/components/shared/visitor-country";
import { auth, currentSession, sessionAccountGate } from "@/lib/auth";
import { db } from "@/lib/db";
import { toCountry } from "@/lib/countries";
import { getVisitorCountry } from "@/lib/countries/server";
import { activeCountryCodes } from "@/lib/countries/settings";
import { DeactivatedGate } from "./reactivate/deactivated-gate";
import { SuspendedScreen } from "./suspended-screen";
import { preload } from "react-dom";

/**
 * The calls every dashboard page makes first (DashboardDataProvider), started by the browser while it parses the HTML
 * instead of after the JS has run (QA PA-M1 b): the provider's fetch()es pick up these responses. Same-origin GETs
 * with the default credentials, which `crossOrigin: "anonymous"` matches.
 */
const FIRST_CALLS = ["/api/profile", "/api/notifications/unread-count", "/api/me/counts"];

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
  // The web session, handed to the client so it doesn't fetch /api/auth/session again on load (QA WA-10)
  const webSession = await auth().catch(() => null);

  // Suspended accounts: every user API refuses them, so show one explanation instead of empty pages
  if (gate === "suspended") {
    return (
      <Providers>
        <main id="main" tabIndex={-1} className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
          <SuspendedScreen />
        </main>
      </Providers>
    );
  }

  // Deactivated accounts (paused or pending deletion) only see /dashboard/reactivate
  if (gate === "deactivated") {
    return (
      <Providers>
        <main id="main" tabIndex={-1} className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
              <DeactivatedGate>{children}</DeactivatedGate>
        </main>
        <Toaster position="top-center" dir="rtl" richColors closeButton />
      </Providers>
    );
  }

  for (const href of FIRST_CALLS) preload(href, { as: "fetch", crossOrigin: "anonymous" });
  return (
    <Providers session={webSession?.user?.id ? webSession : undefined}>
      <OneSignalProvider />
      <DashboardDataProvider>
        <div className={`flex min-h-screen overflow-x-hidden`}>
          <DashboardSidebar />
          <main id="main" tabIndex={-1} className="flex-1 md:pt-0 pt-[58px] pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 min-w-0">
            {/* At least a screen tall: the footer stays below the fold while a page loads, instead of sitting under the
                spinner and jumping when the content arrives (QA PA-M4) */}
            {/* One of two widths per page, with the one banner slot above the title (design review P1-5 / P1-6) */}
            <DashboardColumn>
              {/* The admin's popup alert, once per member (admin → Popup Alerts) */}
              <AlertPopup />
              {children}
            </DashboardColumn>
            <DashboardFooter />
          </main>
        </div>
        <Toaster position="top-center" dir="rtl" richColors closeButton />
      </DashboardDataProvider>
    </Providers>
  );
}
