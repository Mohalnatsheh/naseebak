import Image from "next/image";
import type { ReactNode } from "react";
import { HeartHandshake, Shield, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One auth shell for sign-in and sign-up (design review P2-3 / DS-07 / DS-08): Amman at blue hour under the navy on
 * the wide-screen side panel, the form on a quiet page background on the other side. No full-page photo behind the
 * form, so a long form never shows the photo's edge (the old register seam).
 */
export function AuthShell({
  tagline,
  children,
  width = "md",
}: {
  tagline: string;
  children: ReactNode;
  /** The form column: md for sign-in, lg for the longer sign-up */
  width?: "md" | "lg";
}) {
  return (
    <main id="main" tabIndex={-1} className="flex min-h-screen flex-row-reverse bg-background">
      {/* The brand panel (wide screens), on the right in RTL */}
      <div className="relative hidden items-center justify-center overflow-hidden lg:flex lg:w-1/2 xl:w-[55%]">
        <Image src="/images/pages/auth.webp" alt="" fill priority sizes="55vw" className="object-cover" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-bl from-primary/90 via-primary/80 to-primary-deep/80" />
        <div className="landing-khatam absolute inset-0" aria-hidden />

        <div className="relative z-10 flex flex-col items-center px-12 text-center text-primary-foreground">
          <div className="mb-8" style={{ animation: "fadeSlideDown 1s var(--motion-ease) 0.2s both" }}>
            <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
              <HeartHandshake className="size-10 opacity-90" aria-hidden />
            </div>
            <Image src="/images/logo.svg" alt="نصيبك" width={320} height={140} className="mx-auto h-32 w-auto brightness-0 invert xl:h-40" />
          </div>
          <p className="max-w-sm text-xl font-medium leading-relaxed opacity-85" style={{ animation: "fadeSlideUp 1s var(--motion-ease) 0.4s both" }}>
            {tagline}
            <br />
            بستر واحترام
          </p>
          <div className="my-10 h-px w-32 bg-gradient-to-l from-transparent via-accent/60 to-transparent" aria-hidden />
          <div className="flex flex-col gap-4 text-sm opacity-75" style={{ animation: "fadeSlideUp 1s var(--motion-ease) 0.8s both" }}>
            <span className="flex items-center justify-center gap-2">
              <Shield className="size-4" aria-hidden />
              صورك ضبابية حتى التوافق المتبادل
            </span>
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="size-4" aria-hidden />
              توافق ذكي ودقيق
            </span>
          </div>
        </div>
      </div>

      {/* The form, on the left in RTL: a plain page background that grows with the form */}
      <div className="relative flex w-full items-center justify-center bg-gradient-to-b from-primary/[0.04] via-background to-background p-4 py-8 sm:p-12 lg:w-1/2 xl:w-[45%]">
        <div className={cn("relative w-full", width === "lg" ? "max-w-lg" : "max-w-md")}>{children}</div>
      </div>
    </main>
  );
}

/** The gold-to-navy rule along the top of the auth card (same on sign-in and sign-up) */
export function AuthCardRule() {
  return <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-accent via-accent/70 to-primary" aria-hidden />;
}
