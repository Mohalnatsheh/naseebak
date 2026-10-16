"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export const REACTIVATE_PATH = "/dashboard/reactivate";

/**
 * Rendered by the dashboard layout instead of the normal shell while the account is
 * deactivated: only /dashboard/reactivate is shown, every other dashboard page is
 * replaced by it (its children never mount, so they fire no API calls).
 */
export function DeactivatedGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const onReactivatePage = pathname === REACTIVATE_PATH;

  useEffect(() => {
    if (!onReactivatePage) router.replace(REACTIVATE_PATH);
  }, [onReactivatePage, router]);

  if (!onReactivatePage) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}
