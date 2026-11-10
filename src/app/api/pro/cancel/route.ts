import { cancelPro } from "@/lib/pro/manage";
import { manageProRoute } from "@/lib/pro/manage-route";

/** Stop renewing Pro: it stays until the paid period ends. Allowed while paused (QA WP2-02) */
export function POST() {
  return manageProRoute(cancelPro, true, { allowDeactivated: true });
}
