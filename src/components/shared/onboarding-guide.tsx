"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDashboardData } from "@/contexts/dashboard-context";
import { Heart, User, Camera, Brain, Shield, Sparkles, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CREDIT_ON_INTEREST_LINE } from "@/lib/suggestions/copy";

const STORAGE_KEY = "naseeb_onboarding_completed";

interface Step {
  icon: typeof Heart;
  title: string;
  description: string;
  link?: string;
}

const legacySteps: Step[] = [
  {
    icon: Heart,
    title: "مرحباً بك في نصيبك",
    description: "منصة نصيبك تساعدك في العثور على شريك حياتك بطريقة محترمة وآمنة. دعنا نرشدك لأهم الخطوات.",
  },
  {
    icon: User,
    title: "أكمل ملفك الشخصي",
    description: "أضف معلوماتك الشخصية وتفضيلاتك. كلما كان ملفك أكثر اكتمالاً، زادت فرص التوافق.",
    link: "/dashboard/profile/setup",
  },
  {
    icon: Camera,
    title: "ارفع صورك",
    description: "أضف صورك الشخصية. ستظهر فقط للأشخاص الذين توافقتم معهم.",
    link: "/dashboard/photos",
  },
  {
    icon: Brain,
    title: "أكمل اختبار الشخصية",
    description: "اختبار قصير يساعدنا في فهم شخصيتك وتقديم اقتراحات أفضل.",
    link: "/dashboard/personality-quiz",
  },
  {
    icon: Sparkles,
    title: "أنت جاهز!",
    description: "بعد إكمال ملفك ستبدأ بتلقي اقتراحات التوافق. بالتوفيق!",
  },
];

const newCycleSteps: Step[] = [
  {
    icon: Heart,
    title: "مرحباً بك في نصيبك",
    description: "طريقة محترمة وآمنة للوصول إلى شريك الحياة، بستر وبرضا العائلتين.",
  },
  {
    icon: User,
    title: "إعداد قصير لملفك",
    description: "بضع خطوات أساسية فقط، والباقي اختياري يمكنك إكماله لاحقاً.",
    link: "/dashboard/profile/setup",
  },
  {
    icon: Sparkles,
    title: "اقتراحات أسبوعية مجانية",
    description: "تصلك اقتراحات تناسبك كل أسبوع. اضغط «مهتم» أو «لا»، ولا يعرف أحد قرارك إلا عند التوافق.",
    link: "/dashboard/suggestions",
  },
  {
    icon: Shield,
    title: "بعد التوافق تختار طريقة التعارف",
    description: "تعارف عائلي تتبادل فيه العائلتان بيانات وليّ الأمر، أو محادثة قصيرة داخل نصيبك قبل الزيارة.",
    link: "/dashboard/matches",
  },
];

/** Credit on interest: suggestions flow continuously; "مهتم" costs 1 credit and picks the introduction. */
function creditOnInterestSteps(chat: boolean): Step[] {
  return newCycleSteps.map((step, i) =>
    i === 2
      ? {
          ...step,
          title: "اقتراحات مجانية باستمرار",
          description: `تصلك اقتراحات تناسبك تباعاً. اضغط «مهتم» أو «لا»، ولا يعرف أحد قرارك إلا عند التوافق. ${CREDIT_ON_INTEREST_LINE}`,
        }
      : i === 3
        ? {
            ...step,
            title: "عند «مهتم» تختار طريقة التعارف",
            description: chat
              ? "محادثة هنا أولاً أو تعارف عائلي مباشرة. إذا كان الاهتمام متبادلاً يبدأ التعارف فوراً."
              : "تعارف عائلي تتبادل فيه العائلتان بيانات وليّ الأمر. إذا كان الاهتمام متبادلاً يبدأ التعارف فوراً.",
          }
        : step
  );
}

export const ONBOARDING_DONE_EVENT = "naseeb:onboarding-done";

export function OnboardingGuide() {
  const router = useRouter();
  const pathname = usePathname();
  const { counts } = useDashboardData();
  const steps = counts.flags.creditOnInterest
    ? creditOnInterestSteps(counts.flags.chat)
    : counts.flags.introRequests
      ? newCycleSteps
      : legacySteps;
  const [show, setShow] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      setShow(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
    setShow(false);
    window.dispatchEvent(new CustomEvent(ONBOARDING_DONE_EVENT));
  }

  function go(link: string) {
    dismiss();
    router.push(link);
  }

  // Never cover the setup wizard itself
  if (!show || pathname.startsWith("/dashboard/profile/setup")) return null;

  const step = steps[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-card rounded-3xl border shadow-2xl overflow-hidden">
        {/* Skip button */}
        <button
          onClick={dismiss}
          className="absolute top-4 left-4 z-10 h-8 w-8 rounded-full bg-muted/80 flex items-center justify-center hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Content */}
        <div className="p-8 pt-12 text-center">
          {/* Icon */}
          <div className={`mx-auto mb-6 h-20 w-20 rounded-3xl flex items-center justify-center shadow-lg ${
            "bg-gradient-to-br from-primary to-secondary"
          }`}>
            <Icon className="h-10 w-10 text-white" />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-foreground mb-3">{step.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            {step.description}
          </p>
          {step.link && !isLast && (
            <button
              type="button"
              onClick={() => go(step.link!)}
              className="mt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              اذهب إليها الآن
            </button>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 pb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? "w-6 bg-primary"
                  : i < currentStep
                  ? "w-2 bg-primary/40"
                  : "w-2 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="p-6 pt-2 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentStep(currentStep - 1)}
            disabled={isFirst}
            className="rounded-xl"
          >
            <ChevronRight className="h-4 w-4 me-1" />
            السابق
          </Button>

          {isLast ? (
            <Button onClick={() => go("/dashboard/profile/setup")} className="rounded-xl font-semibold px-6">
              ابدأ بإعداد ملفك
              <Sparkles className="h-4 w-4 ms-1" />
            </Button>
          ) : (
            <Button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="rounded-xl font-semibold px-6"
            >
              التالي
              <ChevronLeft className="h-4 w-4 ms-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
