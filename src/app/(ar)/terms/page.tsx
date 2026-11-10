import { getCycleFlags } from "@/lib/settings";
import { proSoldIn } from "@/lib/pro/on-sale";
import { TermsView } from "./terms-view";

/** Server wrapper: the terms read the live switches (see buildSections in terms-view.tsx) and whether Pro is sold */
export default async function TermsPage() {
  const [flags, JO, SA, LB] = await Promise.all([getCycleFlags(), proSoldIn("JO"), proSoldIn("SA"), proSoldIn("LB")]);
  return <TermsView creditOnInterest={flags.creditOnInterest} freeInterestReply={!!flags.freeInterestReply} proSold={{ JO, SA, LB }} />;
}
