import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    // TODO: Verify webhook signature from payment provider
    // TODO: Update payment status based on webhook event
    console.log("Payment webhook received:", body.substring(0, 100));

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
