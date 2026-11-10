import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { fulfilCheckoutSession } from "@/lib/payments/fulfil";
import { fulfilPaymentIntent, isOurIntent } from "@/lib/payments/intent";
import { webDeviceFromUserAgent } from "@/lib/alerts";

export const metadata: Metadata = { title: "العودة إلى التطبيق", robots: { index: false } };

/** Stripe checkout session ids ("cs_live_…" / "cs_test_…") and PaymentIntent ids ("pi_…") */
const SESSION_ID = /^cs_(live|test)_[A-Za-z0-9]+$/;
const INTENT_ID = /^pi_[A-Za-z0-9]+$/;

/**
 * Where a Stripe-hosted checkout started from the mobile app returns. The app checks the result itself
 * (GET /api/payments/[id]/status). On success this page also asks Stripe and fulfils a paid session (once — the same
 * idempotent step as the status check and the webhook), so the balance is already up to date when the member is back.
 * Android: «العودة إلى التطبيق» is a plain /dashboard/payments link (a full navigation, so Chrome hands it to the app
 * through App Links: the app opens home, then its credits screen). iPhone: Safari never opens the app for a link on
 * the same site, so the page points to «◀ نصيبك» at the top instead.
 * Arabic payment page (2026-11-05): Stripe returns here with `payment_intent` + `redirect_status`, plus our `pid` and
 * `from=app|web`; a paid intent is credited here too (once), a bank still confirming says so, and website members are
 * sent to their balance page instead of the app.
 */
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { status, session_id: sessionId, payment_intent: intentId, redirect_status: redirect, pid, from } = await searchParams;
  let ok = status === "success";
  let processing = false;
  if (intentId && INTENT_ID.test(intentId)) {
    try {
      const intent = await getStripe().paymentIntents.retrieve(intentId);
      const ours = isOurIntent(intent) && intent.metadata.paymentId === pid;
      if (ours && intent.status === "succeeded") await fulfilPaymentIntent(intent);
      ok = ours && intent.status === "succeeded";
      processing = ours && intent.status === "processing";
    } catch (error) {
      // The webhook, the app's status check and the daily job still add it; trust Stripe's redirect status meanwhile
      console.error("[payments] return page intent check failed:", error);
      ok = redirect === "succeeded";
    }
  }
  if (from === "web") {
    return (
      <main id="main" tabIndex={-1} dir="rtl" className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">{ok ? "تم الدفع بنجاح" : processing ? "الدفع قيد التأكيد" : "لم تكتمل عملية الدفع"}</h1>
        <p className="text-muted-foreground">
          {ok
            ? "أُضيف الرصيد إلى حسابك."
            : processing
              ? "يؤكّد البنك الدفعة الآن، وسيُضاف الرصيد تلقائياً خلال دقائق."
              : "لم يتم خصم أي مبلغ. يمكنك المحاولة مرة أخرى من صفحة الرصيد."}
        </p>
        <Link href="/dashboard/payments" className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground">
          صفحة الرصيد
        </Link>
      </main>
    );
  }
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
    <main id="main" tabIndex={-1} dir="rtl" className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold text-foreground">{ok ? "تم استلام الدفع" : processing ? "الدفع قيد التأكيد" : "لم تكتمل عملية الدفع"}</h1>
      <p className="text-muted-foreground">
        {ok
          ? "يمكنك الرجوع إلى تطبيق نصيبك: سيظهر رصيدك الجديد خلال لحظات."
          : processing
            ? "يؤكّد البنك الدفعة الآن، وسيُضاف الرصيد تلقائياً خلال دقائق. يمكنك الرجوع إلى التطبيق."
            : "لم يتم خصم أي مبلغ. يمكنك الرجوع إلى التطبيق والمحاولة مرة أخرى."}
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
