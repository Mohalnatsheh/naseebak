import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { fulfilCheckoutSession } from "@/lib/payments/fulfil";
import { webDeviceFromUserAgent } from "@/lib/alerts";

export const metadata: Metadata = { title: "العودة إلى التطبيق", robots: { index: false } };

/** Stripe checkout session ids ("cs_live_…" / "cs_test_…") */
const SESSION_ID = /^cs_(live|test)_[A-Za-z0-9]+$/;

/**
 * Where a Stripe-hosted checkout started from the mobile app returns. The app checks the result itself
 * (GET /api/payments/[id]/status). On success this page also asks Stripe and fulfils a paid session (once — the same
 * idempotent step as the status check and the webhook), so the balance is already up to date when the member is back.
 * Android: «العودة إلى التطبيق» is a plain /dashboard/payments link (a full navigation, so Chrome hands it to the app
 * through App Links: the app opens home, then its credits screen). iPhone: Safari never opens the app for a link on
 * the same site, so the page points to «◀ نصيبك» at the top instead.
 */
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { status, session_id: sessionId } = await searchParams;
  const ok = status === "success";
  if (ok && sessionId && SESSION_ID.test(sessionId)) {
    try {
      await fulfilCheckoutSession(await getStripe().checkout.sessions.retrieve(sessionId));
    } catch (error) {
      // The webhook, the app's status check and the daily job still add it
      console.error("[payments] return page fulfil failed:", error);
    }
  }
  const device = webDeviceFromUserAgent((await headers()).get("user-agent"));

  return (
    <main dir="rtl" className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold text-foreground">{ok ? "تم استلام الدفع" : "لم تكتمل عملية الدفع"}</h1>
      <p className="text-muted-foreground">
        {ok ? "ارجع إلى تطبيق نصيبك: سيظهر رصيدك الجديد خلال لحظات." : "لم يتم خصم أي مبلغ. يمكنك الرجوع إلى التطبيق والمحاولة مرة أخرى."}
      </p>
      {device === "android" && (
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- a full navigation, so Android hands it to the app
        <a
          href="/dashboard/payments"
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground"
        >
          العودة إلى التطبيق
        </a>
      )}
      {device === "iphone" && (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-foreground">
          للعودة اضغط «◀ نصيبك» أعلى يسار الشاشة، أو افتح التطبيق من الشاشة الرئيسية.
        </p>
      )}
      {device !== "android" && (
        <Link href="/dashboard/payments" className="text-sm font-semibold text-primary hover:underline">
          أو افتح صفحة الرصيد على الموقع
        </Link>
      )}
    </main>
  );
}
