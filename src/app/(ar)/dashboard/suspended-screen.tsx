"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Ban, Loader2, LogOut, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Rendered by the dashboard layout instead of every dashboard page while the account is suspended:
 * the user APIs all refuse a suspended session, so the normal pages would only show empty lists.
 * Suspended users can't use /dashboard/support either, so this points to the public contact page.
 */
export function SuspendedScreen() {
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div dir="rtl" className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-10">
      <Image src="/images/logo.svg" alt="نصيبك" width={110} height={48} className="mb-8 h-10 w-auto" priority />

      <Card className="relative w-full overflow-hidden border-border/60 shadow-lg">
        <div className="h-1.5 bg-gradient-to-l from-destructive to-destructive/60" />
        <CardContent className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-destructive/15 to-destructive/5">
              <Ban className="h-8 w-8 text-destructive" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">تم إيقاف حسابك</h1>
          </div>

          <div className="space-y-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm leading-relaxed text-foreground">
              أوقفت إدارة نصيبك هذا الحساب، لذلك لا يمكن استخدام لوحة التحكم حالياً. ملفك مخفي ولا تصل منه أو إليه
              اقتراحات أو طلبات أو رسائل.
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              إن كان الإيقاف بالخطأ، يمكنك التواصل معنا لمراجعة حسابك.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-xl bg-gradient-to-l from-primary to-secondary text-base font-semibold text-primary-foreground shadow-md"
            >
              <Link href="/contact">
                <Mail className="me-2 h-5 w-5" aria-hidden="true" />
                التواصل معنا
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={signingOut}
              onClick={() => {
                setSigningOut(true);
                signOut({ callbackUrl: "/login" });
              }}
              className="h-12 rounded-xl font-semibold"
            >
              {signingOut ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <LogOut className="me-2 h-5 w-5" aria-hidden="true" />
                  تسجيل الخروج
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
