import { offerPackageName } from "@/lib/payments/offer";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { dollarChargeLine, findAnyPackage } from "@/lib/payments/packages";
import { displayPrice } from "@/lib/payments/checkout-branding";
import { fulfilPaymentIntent, tokenMatches } from "@/lib/payments/intent";
import { ArabicPayForm } from "@/components/payments/arabic-pay-form";

export const metadata: Metadata = { title: "الدفع", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} dir="rtl" className="mx-auto min-h-[100dvh] max-w-md px-5 py-8">
      <div className="mb-6 flex items-center justify-center">
        {/* The site's own logo (navbar): the wordmark with the gold dot */}
        <Image src="/images/logo.svg" alt="نصيبك" width={138} height={60} className="h-12 w-auto" priority />
      </div>
      {children}
    </main>
  );
}

function Message({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <Shell>
      <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-6 text-center">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
        <Link href={href} className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
          {cta}
        </Link>
      </div>
    </Shell>
  );
}

/**
 * Arabic payment page (lib/payments/intent): /pay/<paymentId>?t=<payToken>&from=app|web. No sign-in — the token in the
 * link is the key (the app opens this in the phone's browser). Shows the package and price in Arabic and Stripe's card
 * form in Arabic; after paying, Stripe sends the member to /payments/return, which credits the payment (once) and
 * says where to go next.
 */
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const { t, from } = await searchParams;
  const back = from === "app" ? { href: "/payments/return?status=cancelled&from=app", cta: "العودة" } : { href: "/dashboard/payments", cta: "صفحة الرصيد" };

  const payment = await db.payment.findUnique({
    where: { id },
    select: { id: true, status: true, payToken: true, stripePaymentIntentId: true, planName: true, amount: true, currency: true, chargeCurrency: true, bonusCredits: true },
  });
  if (!payment || !payment.stripePaymentIntentId || !tokenMatches(payment.payToken, t)) {
    return <Message title="رابط الدفع غير صالح" body="يمكنك فتح صفحة الرصيد واختيار الباقة من جديد." href={back.href} cta={back.cta} />;
  }
  if (payment.status === "COMPLETED") {
    return <Message title="تم الدفع مسبقاً" body="أُضيف الرصيد إلى حسابك." href={back.href} cta={back.cta} />;
  }
  if (payment.status !== "PENDING") {
    return <Message title="انتهت عملية الدفع هذه" body="يمكنك اختيار الباقة من جديد لبدء عملية دفع جديدة." href={back.href} cta={back.cta} />;
  }

  const intent = await getStripe().paymentIntents.retrieve(payment.stripePaymentIntentId);
  if (intent.status === "succeeded") {
    await fulfilPaymentIntent(intent);
    return <Message title="تم الدفع" body="أُضيف الرصيد إلى حسابك." href={back.href} cta={back.cta} />;
  }
  if (intent.status === "canceled" || !intent.client_secret) {
    return <Message title="انتهت عملية الدفع هذه" body="يمكنك اختيار الباقة من جديد لبدء عملية دفع جديدة." href={back.href} cta={back.cta} />;
  }

  const pkg = findAnyPackage(payment.planName);
  // This checkout's own price: the package's may have changed since it started
  const price = pkg ? displayPrice({ ...pkg, price: Number(payment.amount) }) : "";
  // The dollar amount only for a row charged in dollars (the row's own currency, never today's switch)
  const charged = pkg ? dollarChargeLine(payment) : null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://naseebak.com";
  const returnUrl = `${appUrl}/payments/return?status=success&pid=${encodeURIComponent(payment.id)}&from=${from === "app" ? "app" : "web"}`;

  return (
    <Shell>
      <div className="space-y-5">
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <p className="text-sm text-muted-foreground">الشراء من نصيبك</p>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <h1 className="text-xl font-bold text-foreground">{pkg ? (payment.bonusCredits ? offerPackageName(pkg.name, payment.bonusCredits) : pkg.name) : "رصيد"}</h1>
            <p className="text-2xl font-bold text-primary">{price}</p>
          </div>
          {charged ? (
            <p className="mt-2 text-xs text-muted-foreground">
              تُخصم <span dir="ltr">{charged}</span> بالدولار الأمريكي · يظهر في كشف البنك باسم <span dir="ltr">LOGICCR* NASEEBAK</span>
            </p>
          ) : payment.chargeCurrency === "jod" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              الدفع بالدينار الأردني · يظهر في كشف البنك باسم <span dir="ltr">LOGICCR* NASEEBAK</span>
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <ArabicPayForm clientSecret={intent.client_secret} priceLabel={price} returnUrl={returnUrl} />
        </div>

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
          دفع آمن ومشفّر عبر Stripe. لا نرى بيانات بطاقتك ولا نحفظها.
        </p>
        <p className="text-center">
          <Link href={back.href} className="text-sm text-muted-foreground underline underline-offset-4">
            {from === "app" ? "إلغاء والعودة إلى التطبيق" : "إلغاء والعودة إلى صفحة الرصيد"}
          </Link>
        </p>
      </div>
    </Shell>
  );
}
