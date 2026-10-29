import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "العودة إلى التطبيق", robots: { index: false } };

/**
 * Where a Stripe-hosted checkout started from the mobile app returns. The app checks the result itself
 * (GET /api/payments/[id]/status, which also adds the credits once Stripe confirms the payment); this page only says
 * what happened and how to go back. It never adds credits.
 */
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { status } = await searchParams;
  const ok = status === "success";
  return (
    <main dir="rtl" className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold text-foreground">{ok ? "تم استلام الدفع" : "لم تكتمل عملية الدفع"}</h1>
      <p className="text-muted-foreground">
        {ok ? "ارجع إلى تطبيق نصيبك: سيظهر رصيدك الجديد خلال لحظات." : "لم يتم خصم أي مبلغ. يمكنك الرجوع إلى التطبيق والمحاولة مرة أخرى."}
      </p>
      <Link href="/dashboard/payments" className="text-sm font-semibold text-primary hover:underline">
        أو افتح صفحة الرصيد على الموقع
      </Link>
    </main>
  );
}
