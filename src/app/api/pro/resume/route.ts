import { resumePro } from "@/lib/pro/manage";
import { manageProRoute } from "@/lib/pro/manage-route";

/** Undo a cancel before the period ends («متابعة الاشتراك») */
export function POST() {
  return manageProRoute(resumePro, false);
}
