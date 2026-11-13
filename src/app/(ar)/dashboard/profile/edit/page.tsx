import { getAuthRedesignEnabled } from "@/lib/settings";
import { EditList } from "@/components/profile/edit/edit-list";
import LegacyEditPage from "./legacy-edit-page";

export const dynamic = "force-dynamic";

/** The switch `auth_profile_redesign` picks the one-list edit with a save bar; off renders today's wizard */
export default async function ProfileEditPage() {
  if (!(await getAuthRedesignEnabled())) return <LegacyEditPage />;
  return <EditList />;
}
