import { Suspense } from "react";
import { getAuthRedesignEnabled } from "@/lib/settings";
import { AuthFlow } from "@/components/auth/auth-flow";
import LegacyLoginPage from "./legacy-login-page";

export const dynamic = "force-dynamic";

/** The switch `auth_profile_redesign` picks the new sign-in; off renders today's page */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; exists?: string }>;
}) {
  const [redesign, sp] = await Promise.all([getAuthRedesignEnabled(), searchParams]);
  if (!redesign) return <LegacyLoginPage />;
  return (
    <Suspense fallback={null}>
      <AuthFlow
        mode="login"
        callbackUrl={typeof sp.callbackUrl === "string" ? sp.callbackUrl : undefined}
        existsNotice={sp.exists === "true"}
      />
    </Suspense>
  );
}
