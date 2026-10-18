"use client";

import Link from "next/link";
import { ChevronLeft, UserPen, Inbox, MessageCircle, Sparkles, Users, Coins, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import { CREDIT_ON_INTEREST_LINE } from "@/lib/suggestions/copy";
import { missingSetupSteps } from "@/lib/profile-completeness";

interface Props {
  /** Profile is ready for suggestions (short setup done in the new cycle, 50% in legacy) */
  qualifies: boolean;
  /** null while loading */
  pendingSuggestions: number | null;
  /**
   * All my matches (kept for callers). The match steps use `counts.actionableMatches` instead:
   * blocked, inactive and finished matches have nothing left to do.
   */
  matchesCount?: number;
  credits: number;
}

interface Step {
  icon: typeof Inbox;
  title: string;
  text: string;
  href: string;
  cta: string;
  tone: "primary" | "accent";
}

/** The one thing worth doing next, so the dashboard never leaves the user guessing. */
export function NextStepCard({ qualifies, pendingSuggestions, credits }: Props) {
  const { counts, profile } = useDashboardData();
  const newCycle = counts.flags.introRequests;
  const actionableMatches = counts.actionableMatches ?? 0;
  // Credit on interest: "مهتم" costs 1 credit; requests are free
  const creditOnInterest = !!counts.flags.creditOnInterest;
  const balance = counts.credits ?? credits;
  // Imperatives addressed to the viewer: feminine for women
  const female = profile?.gender === "FEMALE";
  const g = (masculine: string, feminine: string) => (female ? feminine : masculine);

  let step: Step;
  if (!qualifies) {
    // Say exactly which required step is left
    const missing = newCycle && profile ? missingSetupSteps(profile) : [];
    const setupText = missing.length > 0
        ? `بقي: ${missing.map((s) => s.label).join("، ")}. لن تبدأ اقتراحاتك قبل إكمالها.`
        : "خطوات قصيرة فقط، والباقي اختياري يمكنك إكماله لاحقاً.";
    step = {
      icon: UserPen,
      title: newCycle
        ? g("أكمل إعداد ملفك لتبدأ اقتراحاتك", "أكملي إعداد ملفك لتبدأ اقتراحاتك")
        : g("أكمل ملفك لتبدأ الاقتراحات", "أكملي ملفك لتبدأ الاقتراحات"),
      text: newCycle ? setupText : "يلزم إكمال ملفك بنسبة 50% على الأقل.",
      href: "/dashboard/profile/setup",
      cta: "متابعة الإعداد",
      tone: "accent",
    };
  } else if (newCycle && counts.pendingIntros > 0) {
    step = {
      icon: Inbox,
      title: counts.pendingIntros === 1 ? "لديك طلب تعارف بانتظار ردك" : "لديك طلبات تعارف بانتظار ردك",
      text: "الطلبات تنتهي بعد 7 أيام من إرسالها.",
      href: counts.pendingIntroMatchId
        ? `/dashboard/matches?match=${encodeURIComponent(counts.pendingIntroMatchId)}`
        : "/dashboard/matches",
      cta: "عرض الطلب",
      tone: "accent",
    };
  } else if (counts.unreadChats > 0) {
    step = {
      icon: MessageCircle,
      title: "لديك رسائل جديدة",
      text: g("تابع محادثتك قبل الزيارة العائلية.", "تابعي محادثتك قبل الزيارة العائلية."),
      href: "/dashboard/chats",
      cta: "فتح المحادثات",
      tone: "primary",
    };
  } else if (!newCycle && pendingSuggestions === 0 && credits === 0) {
    step = {
      icon: Coins,
      title: "انتهى رصيد اقتراحاتك",
      text: g("اشحن رصيدك لتستمر باستلام اقتراحات جديدة تناسبك.", "اشحني رصيدك لتستمري باستلام اقتراحات جديدة تناسبك."),
      href: "/dashboard/payments",
      cta: g("اشحن رصيدك", "اشحني رصيدك"),
      tone: "accent",
    };
  } else if (creditOnInterest && (pendingSuggestions ?? 0) > 0 && balance <= 0) {
    step = {
      icon: Coins,
      title: g("اشحن رصيدك لتُبدي اهتمامك", "اشحني رصيدك لتُبدي اهتمامك"),
      text: CREDIT_ON_INTEREST_LINE,
      href: "/dashboard/payments",
      cta: g("اشحن رصيدك", "اشحني رصيدك"),
      tone: "accent",
    };
  } else if ((pendingSuggestions ?? 0) > 0) {
    step = {
      icon: Sparkles,
      title: pendingSuggestions === 1 ? "لديك اقتراح جديد" : "لديك اقتراحات جديدة",
      text: g(
        "اطّلع عليها وقرّر. لا نُطلع أحداً على قرار «لا».",
        "اطّلعي عليها وقرّري. لا نُطلع أحداً على قرار «لا»."
      ),
      href: "/dashboard/suggestions",
      cta: "عرض الاقتراحات",
      tone: "primary",
    };
  } else if (newCycle && !creditOnInterest && actionableMatches > 0 && credits === 0) {
    step = {
      icon: Coins,
      title: "رصيدك صفر",
      text: g(
        "اشحن رصيدك لإرسال طلب تعارف عائلي أو طلب محادثة لتوافقاتك.",
        "اشحني رصيدك لإرسال طلب تعارف عائلي أو طلب محادثة لتوافقاتك."
      ),
      href: "/dashboard/payments",
      cta: g("اشحن رصيدك", "اشحني رصيدك"),
      tone: "accent",
    };
  } else if (newCycle && actionableMatches > 0) {
    step = {
      icon: Users,
      title: g("اختر طريقة التعارف مع توافقك", "اختاري طريقة التعارف مع توافقك"),
      text: "تعارف عائلي أو محادثة قصيرة قبل الزيارة.",
      href: "/dashboard/matches",
      cta: "عرض التوافقات",
      tone: "primary",
    };
  } else {
    step = {
      icon: Search,
      title: pendingSuggestions === null ? "جارٍ تجهيز اقتراحاتك…" : "نبحث لك عن اقتراحات مناسبة",
      text: creditOnInterest
        ? "تصلك اقتراحات مجانية باستمرار، حتى 5 في الوقت نفسه، وسنرسل لك إشعاراً فور وصولها."
        : newCycle
          ? "تصلك حتى 3 اقتراحات مجانية كل أسبوع، وسنرسل لك إشعاراً فور وصولها."
          : "سنرسل لك إشعاراً فور وصول اقتراح جديد.",
      href: "/dashboard/suggestions",
      cta: "صفحة الاقتراحات",
      tone: "primary",
    };
  }

  const Icon = step.icon;
  return (
    <Link href={step.href} className="block">
      <Card
        className={cn(
          "group overflow-hidden shadow-md transition-all duration-300 hover:shadow-lg",
          step.tone === "accent"
            ? "border-accent/40 bg-gradient-to-l from-accent/15 via-accent/5 to-transparent"
            : "border-primary/25 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent"
        )}
      >
        <CardContent className="flex items-center gap-4 pt-5 pb-5">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-md",
              step.tone === "accent" ? "bg-accent text-accent-foreground" : "bg-gradient-to-br from-primary to-secondary text-primary-foreground"
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground">خطوتك التالية</p>
            <h2 className="mt-0.5 font-bold text-foreground sm:text-lg">{step.title}</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
          </div>
          <span className="hidden shrink-0 items-center gap-1 rounded-lg bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground sm:inline-flex">
            {step.cta}
            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          </span>
          <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground sm:hidden" />
        </CardContent>
      </Card>
    </Link>
  );
}
