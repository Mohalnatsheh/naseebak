"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Heart, User, Camera, Brain, Shield, Sparkles, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "naseeb_onboarding_completed";

interface Step {
  icon: typeof Heart;
  title: string;
  description: string;
  link?: string;
}

const steps: Step[] = [
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
    icon: Shield,
    title: "وثّق حسابك (اختياري)",
    description: "أضف صورة سيلفي لتحصل على شارة الحساب الموثّق وتزيد من مصداقية ملفك.",
    link: "/dashboard/identity",
  },
  {
    icon: Sparkles,
    title: "أنت جاهز!",
    description: "بعد إكمال جميع الخطوات، ستبدأ بتلقي اقتراحات التوافق. بالتوفيق!",
    link: "/dashboard/suggestions",
  },
];

export function OnboardingGuide() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      setShow(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "true");
    setShow(false);
  }

  function handleFinish() {
    dismiss();
    const lastStep = steps[steps.length - 1];
    if (lastStep.link) router.push(lastStep.link);
  }

  if (!show) return null;

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
            isLast ? "bg-gradient-to-br from-emerald-500 to-emerald-600" : "bg-gradient-to-br from-primary to-secondary"
          }`}>
            <Icon className="h-10 w-10 text-white" />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-foreground mb-3">{step.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            {step.description}
          </p>
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
            <ChevronRight className="h-4 w-4 ml-1" />
            السابق
          </Button>

          {isLast ? (
            <Button
              onClick={handleFinish}
              className="rounded-xl bg-gradient-to-l from-primary to-secondary text-white font-semibold px-6"
            >
              ابدأ الآن
              <Sparkles className="h-4 w-4 mr-1" />
            </Button>
          ) : (
            <Button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="rounded-xl bg-gradient-to-l from-primary to-secondary text-white font-semibold px-6"
            >
              التالي
              <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
