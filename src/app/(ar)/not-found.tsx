import Image from "next/image";
import Link from "@/components/shared/site-link";
import { Compass, Home, LayoutDashboard } from "lucide-react";
import { auth } from "@/lib/auth";

export const metadata = { title: "الصفحة غير موجودة" };

/**
 * The branded Arabic 404. Kept free of client components on purpose (QA PA-L10): this boundary is part of every page
 * under the (ar) layout, so the public Navbar and Footer it used to render shipped their code — and the landing page's
 * chunk they shared — to every dashboard page. Country-aware plain links and the logo only. «لوحة التحكم» shows only to someone
 * signed in (design P3).
 */
export default async function NotFound() {
  const session = await auth().catch(() => null);
  const signedIn = !!session?.user;
  const button =
    "press inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-body font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60 bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4">
          <Link href="/" className="flex min-h-11 items-center" aria-label="نصيبك، الصفحة الرئيسية">
            <Image src="/images/logo.svg" alt="نصيبك" width={110} height={48} className="h-9 w-auto" priority />
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Compass className="h-8 w-8" aria-hidden />
          </div>
          <p className="mt-6 text-5xl font-extrabold tabular-nums text-primary">404</p>
          <h1 className="mt-3 text-2xl font-bold text-foreground">لم نجد هذه الصفحة</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            {signedIn
              ? "ربما تغيّر الرابط أو حُذفت الصفحة. يمكنك العودة إلى الرئيسية أو إلى لوحة التحكم."
              : "ربما تغيّر الرابط أو حُذفت الصفحة. يمكنك العودة إلى الصفحة الرئيسية."}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/" className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}>
              <Home className="h-4 w-4" aria-hidden /> الصفحة الرئيسية
            </Link>
            {signedIn && (
              <Link href="/dashboard" className={`${button} border border-border bg-card text-foreground hover:bg-muted`}>
                <LayoutDashboard className="h-4 w-4" aria-hidden /> لوحة التحكم
              </Link>
            )}
          </div>
        </div>
      </main>
      <footer className="border-t border-border/60 py-6 text-center text-caption text-muted-ink">
        <Link href="/privacy" className="inline-flex min-h-11 items-center px-2 hover:underline">سياسة الخصوصية</Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="inline-flex min-h-11 items-center px-2 hover:underline">شروط الاستخدام</Link>
        <span aria-hidden>·</span>
        <Link href="/contact" className="inline-flex min-h-11 items-center px-2 hover:underline">تواصل معنا</Link>
      </footer>
    </div>
  );
}
