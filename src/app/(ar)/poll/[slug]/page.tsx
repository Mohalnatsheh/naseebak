import type { Metadata } from "next";
import { PublicPollView } from "@/components/engagement/public-poll-view";
import { getPublishedPoll, pollsEnabled } from "@/lib/engagement/polls";
import { loadPollPage } from "../load";
import { socialMetadata } from "@/lib/seo";
import { getVisitorCountry } from "@/lib/countries/server";
import { publicCopy } from "@/lib/public-copy";
import { absoluteUrl } from "@/lib/site-paths";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const country = await getVisitorCountry();
  const poll = (await pollsEnabled()) ? await getPublishedPoll(slug.slice(0, 40), country) : null;
  const title = poll?.question ?? "سؤال نصيبك";
  const description = country === "SA"
    ? "سؤال جديد كل 3 أيام من نصيبك، منصة الزواج الجاد: أجب بضغطة واطّلع على رأي الآخرين."
    : "سؤال جديد كل 3 أيام من نصيبك، منصة الزواج الجاد: جاوب بكبسة وشوف رأي الناس.";
  const url = absoluteUrl(`/poll/${slug}`, country);
  return {
    title,
    description,
    alternates: { canonical: url },
    ...socialMetadata({ title: `${title} | نصيبك`, description, url, locale: publicCopy(country).ogLocale }),
  };
}

export default async function PollSlugPage({ params, searchParams }: Props) {
  const [{ slug }, { utm_source }] = await Promise.all([params, searchParams]);
  const data = await loadPollPage(slug, utm_source);
  return <PublicPollView {...data} />;
}
