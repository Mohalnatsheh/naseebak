import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";

const creditPackages: Record<string, { credits: number; price: number }> = {
  credits_3: { credits: 3, price: 3 },
  credits_5: { credits: 5, price: 4 },
  credits_10: { credits: 10, price: 7 },
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    // Only females can purchase credits
    if (session.user.gender !== "FEMALE") {
      return NextResponse.json(
        { error: "شراء الرصيد متاح للإناث فقط" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { packageId, provider } = body;

    const pkg = creditPackages[packageId];
    if (!pkg) {
      return NextResponse.json({ error: "الباقة غير صالحة" }, { status: 400 });
    }

    // Create payment record
    const payment = await db.payment.create({
      data: {
        userId: session.user.id,
        type: "MATCH_CREDITS",
        planName: packageId,
        amount: pkg.price,
        provider: provider || "STRIPE",
        status: "COMPLETED", // Simulated for now
        description: `شراء ${pkg.credits} رصيد توافق`,
      },
    });

    // Increment user's match credits
    await db.user.update({
      where: { id: session.user.id },
      data: { matchCredits: { increment: pkg.credits } },
    });

    // Notify user
    await db.notification.create({
      data: {
        userId: session.user.id,
        type: "PAYMENT",
        title: "تم شراء الرصيد بنجاح",
        body: `تمت إضافة ${pkg.credits} رصيد توافق إلى حسابك.`,
      },
    });

    // Push notification
    sendPushNotification({
      userId: session.user.id,
      title: "تم شراء الرصيد بنجاح",
      body: `تمت إضافة ${pkg.credits} رصيد توافق إلى حسابك.`,
      url: "/dashboard/payments",
    });

    return NextResponse.json({
      message: "تم شراء الرصيد بنجاح",
      paymentId: payment.id,
      creditsAdded: pkg.credits,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
