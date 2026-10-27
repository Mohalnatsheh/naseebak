"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { toPng } from "html-to-image";
import { Cairo } from "next/font/google";
import { arabicCount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MIN_GENDER_RESULTS, MIN_POLL_RESULTS, percentsOf } from "@/lib/engagement/poll-types";
import type { OptionBreakdown } from "@/lib/engagement/poll-admin";

interface Detail {
  poll: { question: string; slug: string; status: string };
  options: OptionBreakdown[];
}

// The admin panel has no Arabic font; the story (and its PNG) uses the brand font
const cairo = Cairo({ subsets: ["arabic", "latin"], weight: ["400", "700", "800"] });

const W = 1080;
const H = 1920;

/**
 * «نتيجة سؤال نصيبك»: an Instagram story (1080×1920) drawn from the real counts, for the admin to screenshot
 * (Download PNG) and post. Test-account votes are left out, like everywhere else.
 */
export default function PollStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [scale, setScale] = useState(0.35);
  const [saving, setSaving] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/admin/polls/${id}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Failed (${r.status})`);
        setDetail(data);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / W, (window.innerHeight - 180) / H));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const ids = detail?.options.map((o) => o.id) ?? [];
  const total = detail?.options.reduce((s, o) => s + o.total, 0) ?? 0;
  const counts = (k: "total" | "women" | "men") => Object.fromEntries((detail?.options ?? []).map((o) => [o.id, o[k]]));
  const pct = percentsOf(counts("total"), ids);
  const women = detail?.options.reduce((s, o) => s + o.women, 0) ?? 0;
  const men = detail?.options.reduce((s, o) => s + o.men, 0) ?? 0;
  const split = women >= MIN_GENDER_RESULTS && men >= MIN_GENDER_RESULTS;
  const pw = percentsOf(counts("women"), ids);
  const pm = percentsOf(counts("men"), ids);
  const top = detail ? [...detail.options].sort((a, b) => b.total - a.total)[0]?.id : null;

  async function download() {
    if (!frame.current || !detail) return;
    setSaving(true);
    try {
      const url = await toPng(frame.current, { width: W, height: H, pixelRatio: 1, style: { transform: "none" } });
      const a = document.createElement("a");
      a.href = url;
      a.download = `naseebak-poll-${detail.poll.slug}.png`;
      a.click();
    } catch {
      setError("Could not make the image. Try again, or take a screenshot.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/polls">
            <ArrowLeft className="h-4 w-4" /> Naseebak Question
          </Link>
        </Button>
        <Button size="sm" onClick={download} disabled={!detail || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PNG
        </Button>
      </div>
      {total > 0 && total < MIN_POLL_RESULTS && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Only {total} votes so far. Wait for at least {MIN_POLL_RESULTS} before posting results.
        </p>
      )}
      <div ref={holder} className="w-full">
        {!detail ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        ) : (
          <div style={{ width: W * scale, height: H * scale }} className="mx-auto">
            <div
              ref={frame}
              dir="rtl"
              className={`landing-night relative flex flex-col overflow-hidden text-white ${cairo.className}`}
              style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", padding: "150px 90px 120px" }}
            >
              <div className="landing-khatam absolute inset-0" aria-hidden />
              <div className="relative flex flex-1 flex-col">
                <span className="self-start rounded-full bg-accent px-9 py-3 text-[38px] font-bold text-accent-foreground">نتيجة سؤال نصيبك</span>
                <h1 className="font-display mt-14 text-[76px] leading-[1.3]">{detail.poll.question}</h1>
                <div className="mt-16 space-y-8">
                  {detail.options.map((o) => (
                    <div key={o.id} className={`relative overflow-hidden rounded-[36px] border-[3px] px-10 py-8 ${o.id === top ? "border-accent" : "border-white/20"}`}>
                      <span aria-hidden className={`absolute inset-y-0 start-0 ${o.id === top ? "bg-accent/35" : "bg-white/12"}`} style={{ width: `${pct[o.id]}%` }} />
                      <span className="relative flex items-center gap-6">
                        <span className="min-w-0 flex-1 text-[50px] font-bold">{o.label}</span>
                        <span className="text-[64px] font-extrabold">{pct[o.id]}%</span>
                      </span>
                      {split && (
                        <span className="relative mt-2 block text-[34px] text-white/70">
                          النساء {pw[o.id]}% · الرجال {pm[o.id]}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-10 text-[36px] text-white/70">من {arabicCount(total, { one: "صوت واحد", two: "صوتين", few: "أصوات", many: "صوتاً" })} على نصيبك</p>
                <div className="mt-auto flex flex-col items-center gap-6">
                  <p className="text-[44px] font-bold">وإنت؟ جاوب على السؤال الجديد</p>
                  <span className="rounded-full bg-white px-12 py-5 text-[40px] font-bold text-primary" dir="ltr">
                    naseebak.com/poll
                  </span>
                  <Image src="/images/logo.svg" alt="نصيبك" width={300} height={90} className="mt-4 h-auto w-[300px] brightness-0 invert" />
                  <span className="text-[30px] text-white/60">منصة زواج جاد</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
