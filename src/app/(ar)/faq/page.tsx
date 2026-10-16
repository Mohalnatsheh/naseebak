import { getCycleFlags } from "@/lib/settings";
import { FaqContent } from "./faq-content";

/** Answers follow the new-cycle switches, like the landing page. */
export default async function FaqPage() {
  const flags = await getCycleFlags();
  return <FaqContent newCycle={flags.introRequests} chat={flags.chat} creditOnInterest={flags.creditOnInterest} />;
}
