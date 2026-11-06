import type { Metadata } from "next";
import { PublicPollView } from "@/components/engagement/public-poll-view";
import { loadPollPage } from "./load";
import { socialMetadata } from "@/lib/seo";
import { getVisitorCountry } from "@/lib/countries/server";
import { pollCountries } from "@/lib/engagement/polls";
import { publicCopy } from "@/lib/public-copy";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";

/** Each country's question: /poll and /sa/poll */
export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  const sa = country === "SA";
  const open = await pollCountries();
  return {
    // Absolute: the brand is already in the name («سؤال نصيبك | نصيبك» before)
    title: { absolute: sa ? "سؤال نصيبك: أجب واطّلع على رأي الناس | نصيبك" : "سؤال نصيبك: جاوب وشوف رأي الناس | نصيبك" },
    description: sa
      ? "سؤال جديد كل 3 أيام من نصيبك، منصة الزواج الجاد: أجب بضغطة واطّلع على رأي الآخرين."
      : "سؤال جديد كل 3 أيام من نصيبك، منصة الزواج الجاد: جاوب بكبسة وشوف رأي الناس.",
    alternates: seoAlternates("/poll", country, open),
    // No running question here: nothing for search engines yet
    ...(!open.includes(country) && { robots: { index: false, follow: true } }),
    ...socialMetadata({
      title: "سؤال نصيبك",
      description: sa ? "أجب بضغطة واطّلع على رأي الناس." : "جاوب بكبسة وشوف رأي الناس.",
      url: absoluteUrl("/poll", country),
      locale: publicCopy(country).ogLocale,
    }),
  };
}

export default async function PollPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { utm_source } = await searchParams;
  const data = await loadPollPage(null, utm_source);
  return <PublicPollView {...data} />;
}
