import { getCycleFlags } from "@/lib/settings";
import { TermsView } from "./terms-view";

/** Server wrapper: the terms read the live switches (see buildSections in terms-view.tsx) */
export default async function TermsPage() {
  const flags = await getCycleFlags();
  return <TermsView creditOnInterest={flags.creditOnInterest} />;
}
