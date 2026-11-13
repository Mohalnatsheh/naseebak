"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Settings } from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-context";
import { AccountSettingsSection } from "@/components/profile/account-settings-section";
import { LoadError } from "@/components/shared/load-error";
import { PageHeader } from "@/components/shared/page-header";
import { PageLoading } from "@/components/shared/page-loading";

/**
 * «إعدادات الحساب» (`dashboard_redesign` on): pause and delete, on their own page instead of the bottom of the
 * profile page. With the switch off the «حسابي» row still links to the profile page section.
 */
export default function AccountSettingsPage() {
  const { profile, loading, refreshProfile } = useDashboardData();
  const [retrying, setRetrying] = useState(false);

  if (loading) {
    return <PageLoading width="max-w-3xl" />;
  }

  // The copy follows the member's gender: never guess it from a profile that didn't load
  if (!profile) {
    return (
      <div className="py-6">
        <LoadError
          message="تعذّر تحميل حسابك. يمكنك التحقق من الاتصال والمحاولة مرة أخرى."
          onRetry={
            retrying
              ? undefined
              : () => {
                  setRetrying(true);
                  refreshProfile().finally(() => setRetrying(false));
                }
          }
        />
      </div>
    );
  }

  const isMale = profile.gender === "MALE";

  return (
    <div className="space-y-6 pb-8">
      <Link
        href="/dashboard/account"
        className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        حسابي
      </Link>
      <PageHeader
        icon={Settings}
        title="إعدادات الحساب"
        description={isMale ? "تعطيل حسابك مؤقتاً أو حذفه." : "تعطيل حسابكِ مؤقتاً أو حذفه."}
        className="mb-0"
      />
      <AccountSettingsSection isMale={isMale} />
    </div>
  );
}
