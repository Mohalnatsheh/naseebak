import { getAuthRedesignEnabled, getCycleFlags } from "@/lib/settings";
import { ShortSetup } from "@/components/profile/setup/short-setup";
import LegacySetupPage from "./legacy-setup-page";

export const dynamic = "force-dynamic";

/** The switch `auth_profile_redesign` picks the short 3-step setup; off renders today's wizard */
export default async function ProfileSetupPage() {
  const [redesign, flags] = await Promise.all([getAuthRedesignEnabled(), getCycleFlags()]);
  if (!redesign) return <LegacySetupPage />;
  // Legacy cycle only: the guardian is still a setup step
  return <ShortSetup guardianStep={!flags.introRequests} />;
}
