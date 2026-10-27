import type { Metadata } from "next";
import { PublicPollView } from "@/components/engagement/public-poll-view";
import { loadPollPage } from "./load";

export const metadata: Metadata = {
  title: "سؤال نصيبك",
  description: "سؤال جديد كل 3 أيام من نصيبك، منصة الزواج الجاد في الأردن: جاوب بكبسة وشوف رأي الناس.",
  alternates: { canonical: "https://naseebak.com/poll" },
  openGraph: { title: "سؤال نصيبك", description: "جاوب بكبسة وشوف رأي الناس.", url: "https://naseebak.com/poll" },
};

export default async function PollPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { utm_source } = await searchParams;
  const data = await loadPollPage(null, utm_source);
  return <PublicPollView {...data} />;
}
