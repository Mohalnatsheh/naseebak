import Link from "next/link";
import { Compass, Home, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";

export const metadata = { title: "الصفحة غير موجودة" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Compass className="h-8 w-8" />
          </div>
          <p className="mt-6 text-5xl font-extrabold text-primary">404</p>
          <h1 className="mt-3 text-2xl font-bold text-foreground">لم نجد هذه الصفحة</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            ربما تغيّر الرابط أو حُذفت الصفحة. يمكنك العودة إلى الرئيسية أو إلى لوحة التحكم.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/">
                <Home className="h-4 w-4" /> الصفحة الرئيسية
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">
                <LayoutDashboard className="h-4 w-4" /> لوحة التحكم
              </Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
