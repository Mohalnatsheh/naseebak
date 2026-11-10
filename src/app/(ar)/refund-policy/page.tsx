import { proSoldIn } from "@/lib/pro/on-sale";
import { RefundPolicyView } from "./refund-policy-view";

/** Server wrapper: the Pro section shows only while Pro is sold in that country (QA WP2-01) */
export default async function RefundPolicyPage() {
  const [JO, SA] = await Promise.all([proSoldIn("JO"), proSoldIn("SA")]);
  return <RefundPolicyView proSold={{ JO, SA }} />;
}
