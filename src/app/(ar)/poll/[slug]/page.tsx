import type { Metadata } from "next";
import { PublicPollView } from "@/components/engagement/public-poll-view";
import { getPublishedPoll, pollsEnabled } from "@/lib/engagement/polls";
import { loadPollPage } from "../load";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const poll = (await pollsEnabled()) ? await getPublishedPoll(slug.slice(0, 40)) : null;
  const title = poll?.question ?? "سؤال نصيبك";
  return {
    title,
    description: "سؤال جديد كل 3 أيام من نصيبك، منصة الزواج الجاد في الأردن: جاوب بكبسة وشوف رأي الناس.",
    alternates: { canonical: `https://naseebak.com/poll/${slug}` },
    openGraph: { title: `${title} | نصيبك`, url: `https://naseebak.com/poll/${slug}` },
  };
}

export default async function PollSlugPage({ params, searchParams }: Props) {
  const [{ slug }, { utm_source }] = await Promise.all([params, searchParams]);
  const data = await loadPollPage(slug, utm_source);
  return <PublicPollView {...data} />;
}
