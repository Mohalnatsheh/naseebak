"use client";

import Link from "@/components/shared/site-link";

/**
 * The plain frame of the redesigned sign-in / sign-up screens (auth_profile_redesign): a white top bar with the
 * text logo and an optional link, then one centred 420 px column (full width with a 16 px gutter on phones).
 * No photo, side panel or gradient.
 */
export function AuthFrame({
  headerLink,
  children,
}: {
  /** «جديد على نصيبك؟ إنشاء حساب» / «لديك حساب؟ تسجيل الدخول»; none once past the phone screen */
  headerLink?: { lead: string; label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-muted/50 text-ink">
      <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:h-16 sm:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center font-display text-title text-primary">
          نصيبك
        </Link>
        {headerLink && (
          <p className="text-label font-normal text-muted-ink">
            {headerLink.lead}{" "}
            <Link href={headerLink.href} className="inline-flex min-h-11 items-center font-bold text-primary hover:underline underline-offset-4">
              {headerLink.label}
            </Link>
          </p>
        )}
      </header>
      <main id="main" tabIndex={-1} className="w-full px-4 outline-none pb-12 pt-6 sm:mx-auto sm:max-w-[420px] sm:px-0 sm:pt-14">{children}</main>
    </div>
  );
}
