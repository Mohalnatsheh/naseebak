import { Suspense } from "react";
import { getAuthRedesignEnabled } from "@/lib/settings";
import { AuthFlow } from "@/components/auth/auth-flow";
import LegacyRegisterPage from "./legacy-register-page";

export const dynamic = "force-dynamic";

/** The switch `auth_profile_redesign` picks the new sign-up; off renders today's page */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invitationCode?: string }>;
}) {
  const [redesign, sp] = await Promise.all([getAuthRedesignEnabled(), searchParams]);
  if (!redesign) return <LegacyRegisterPage />;
  return (
    <Suspense fallback={null}>
      <AuthFlow mode="register" inviteCode={typeof sp.invitationCode === "string" ? sp.invitationCode : undefined} />
    </Suspense>
  );
}
