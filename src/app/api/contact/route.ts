import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { sendContactNotification } from "@/lib/email";
import { contactSchema } from "@/lib/validations/contact";

/** Public contact form: saved for Admin → Messages, plus a best-effort email to the admin inbox */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = contactSchema.safeParse(body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // A filled honeypot: answer like a success so the bot learns nothing
      if (issue?.path[0] === "website") return NextResponse.json({ ok: true }, { status: 201 });
      return NextResponse.json(
        { error: issue?.message ?? "بيانات غير صالحة", field: issue?.path[0] ?? null },
        { status: 400 },
      );
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const { name, email, subject, message } = parsed.data;
    const byIp = rateLimit(`contact:ip:${ip}`, { maxAttempts: 5, windowMs: 60 * 60 * 1000 });
    const byEmail = rateLimit(`contact:email:${email.toLowerCase()}`, { maxAttempts: 3, windowMs: 60 * 60 * 1000 });
    if (!byIp.success || !byEmail.success) {
      return NextResponse.json({ error: "أرسلت عدة رسائل مؤخراً. حاول مرة أخرى بعد قليل." }, { status: 429 });
    }

    const session = await auth().catch(() => null);
    await db.contactMessage.create({
      data: { name, email, subject, message, userId: session?.user?.id ?? null },
    });
    sendContactNotification({ name, email, subject, message }).catch((err) =>
      console.error("Contact notification email failed:", err),
    );

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json({ error: "تعذّر إرسال رسالتك. حاول مرة أخرى." }, { status: 500 });
  }
}
