"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDashboardData } from "@/contexts/dashboard-context";
import { Heart, User, Camera, Brain, Shield, Sparkles, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CREDIT_ON_INTEREST_LINE } from "@/lib/suggestions/copy";
import { clampStep, readOnboardingDone, shouldShowOnboarding, writeOnboardingDone } from "@/lib/onboarding";


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

type Gendered = (masculine: string, feminine: string) => string;

/**
 * New cycle steps, worded for the viewer. Once the short setup is done (the guide only opens after
 * it, since it never covers the wizard) the setup step is dropped and the guide ends on suggestions.
 */
function newCycleSteps(g: Gendered, setupDone: boolean): Step[] {
  return [
    {
      icon: Heart,
      title: "مرحباً بك في نصيبك",
      description: "طريقة محترمة وآمنة للوصول إلى شريك الحياة، بستر وبرضا العائلتين.",
    },
    ...(setupDone
      ? []
      : [{
          icon: User,
          title: "إعداد قصير لملفك",
          description: g("بضع خطوات أساسية فقط، والباقي اختياري يمكنك إكماله لاحقاً.", "بضع خطوات أساسية فقط، والباقي اختياري يمكنكِ إكماله لاحقاً."),
          link: "/dashboard/profile/setup",
        }]),
    {
      icon: Sparkles,
      title: "اقتراحات أسبوعية مجانية",
      description: g(
        "تصلك اقتراحات تناسبك كل أسبوع. اضغط «مهتم» أو «لا»، ولا نُطلع أحداً على قرار «لا».",
        "تصلكِ اقتراحات تناسبكِ كل أسبوع. اضغطي «مهتم» أو «لا»، ولا نُطلع أحداً على قرار «لا»."
      ),
      link: "/dashboard/suggestions",
    },
    {
      icon: Shield,
      title: g("بعد التوافق تختار طريقة التعارف", "بعد التوافق تختارين طريقة التعارف"),
      description: "تعارف عائلي تتبادل فيه العائلتان بيانات وليّ الأمر، أو محادثة قصيرة داخل نصيبك قبل الزيارة.",
      link: "/dashboard/matches",
    },
  ];
}

/** Credit on interest: suggestions flow continuously; "مهتم" costs 1 credit and picks the introduction. */
function creditOnInterestSteps(chat: boolean, g: Gendered, setupDone: boolean): Step[] {
  return newCycleSteps(g, setupDone).map((step) =>
    step.link === "/dashboard/suggestions"
      ? {
          ...step,
          title: "اقتراحات مجانية باستمرار",
          description: `${g(
            "تصلك اقتراحات تناسبك تباعاً. اضغط «مهتم» أو «لا»، ولا نُطلع أحداً على قرار «لا».",
            "تصلكِ اقتراحات تناسبكِ تباعاً. اضغطي «مهتم» أو «لا»، ولا نُطلع أحداً على قرار «لا»."
          )} ${CREDIT_ON_INTEREST_LINE}`,
        }
      : step.link === "/dashboard/matches"
        ? {
            ...step,
            title: g("عند «مهتم» تختار طريقة التعارف", "عند «مهتم» تختارين طريقة التعارف"),
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
  const { counts, profile, loading } = useDashboardData();
  const g: Gendered = (masculine, feminine) => (profile?.gender === "FEMALE" ? feminine : masculine);
  const setupDone = !!profile?.profile && !!(profile.profile as { isComplete?: boolean }).isComplete;
  const steps = counts.flags.creditOnInterest
    ? creditOnInterestSteps(counts.flags.chat, g, setupDone)
    : counts.flags.introRequests
      ? newCycleSteps(g, setupDone)
      : legacySteps;
  // Done with the setup: the guide ends on suggestions instead of sending back to the wizard
  const finish = setupDone
    ? { label: "عرض الاقتراحات", link: "/dashboard/suggestions" }
    : { label: g("ابدأ بإعداد ملفك", "ابدئي بإعداد ملفكِ"), link: "/dashboard/profile/setup" };
  const nextRef = useRef<HTMLButtonElement>(null);
  const [show, setShow] = useState(false);
  const [decided, setDecided] = useState(false);
  const [currentStep, setStep] = useState(0);
  // The list can shrink when the switches or the setup state change: never point past its end
  const stepIndex = clampStep(currentStep, steps.length);
  const setCurrentStep = (i: number) => setStep(clampStep(i, steps.length));

  // Decide once, after the profile and the switches have loaded (the steps depend on both).
  // Adjusting state while rendering: `loading` is true on the server and at hydration, so
  // localStorage is only read in the browser.
  if (!decided && !loading) {
    setDecided(true);
    const completed = readOnboardingDone(typeof window === "undefined" ? undefined : window.localStorage);
    if (shouldShowOnboarding({ loading, completed, setupDone, createdAt: profile?.createdAt })) setShow(true);
  }

  function dismiss() {
    writeOnboardingDone(typeof window === "undefined" ? undefined : window.localStorage);
    setShow(false);
    window.dispatchEvent(new CustomEvent(ONBOARDING_DONE_EVENT));
  }

  function go(link: string) {
    dismiss();
    router.push(link);
  }

  const open = show && !pathname.startsWith("/dashboard/profile/setup");
  // A real modal: Escape closes it and focus starts inside
  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, currentStep]);

  // Never cover the setup wizard itself
  if (!open) return null;

  const step = steps[stepIndex];
  if (!step) return null;
  const Icon = step.icon;
  const isLast = stepIndex === steps.length - 1;
  const isFirst = stepIndex === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
        className="relative w-full max-w-md bg-card rounded-3xl border shadow-2xl overflow-hidden"
      >
        {/* Skip button */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="إغلاق الدليل"
          className="absolute top-3 end-3 z-10 h-11 w-11 rounded-full bg-muted/80 flex items-center justify-center hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
          <h2 id="onboarding-title" className="text-xl font-bold text-foreground mb-3">{step.title}</h2>
          <p id="onboarding-description" className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            {step.description}
          </p>
          {step.link && !isLast && (
            <button
              type="button"
              onClick={() => go(step.link!)}
              className="mt-4 inline-flex min-h-11 items-center px-3 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {g("انتقل إليها الآن", "انتقلي إليها الآن")}
            </button>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 pb-4" aria-hidden="true">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === stepIndex
                  ? "w-6 bg-primary"
                  : i < stepIndex
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
            onClick={() => setCurrentStep(stepIndex - 1)}
            disabled={isFirst}
            className="h-11 rounded-xl"
          >
            <ChevronRight className="h-4 w-4 me-1" />
            السابق
          </Button>

          {isLast ? (
            <Button ref={nextRef} onClick={() => go(finish.link)} className="h-11 rounded-xl font-semibold px-6">
              {finish.label}
              <Sparkles className="h-4 w-4 ms-1" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              ref={nextRef}
              onClick={() => setCurrentStep(stepIndex + 1)}
              className="h-11 rounded-xl font-semibold px-6"
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
