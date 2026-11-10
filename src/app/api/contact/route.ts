import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendContactNotification } from "@/lib/email";
import { contactSchemaFor } from "@/lib/validations/contact";
import { normalizePhone } from "@/lib/validations/auth";
import { getVisitorCountry } from "@/lib/countries/server";
import { activeCountryCodes } from "@/lib/countries/settings";
import type { CountryCode } from "@/lib/countries";
import { arabicIssueMessage } from "@/lib/validations/issue-message";

/**
 * Public contact form: saved for Admin → Messages (with the visitor's country, the admin filters by it),
 * plus a best-effort email to the admin inbox. The phone must be a mobile of the visitor's country.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    // The page says which country it showed: the cookie can differ (a Saudi link opened earlier, then /contact)
    const shown = typeof body?.country === "string" ? body.country : null;
    const country = shown && (await activeCountryCodes()).includes(shown as CountryCode) ? (shown as CountryCode) : await getVisitorCountry();
    const parsed = contactSchemaFor(country).safeParse(body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // A filled honeypot: answer like a success so the bot learns nothing
      if (issue?.path[0] === "website") return NextResponse.json({ ok: true }, { status: 201 });
      return NextResponse.json(
        { error: arabicIssueMessage(issue), field: issue?.path[0] ?? null },
        { status: 400 },
      );
    }

    const ip = clientIp(request);
    const { name, email, subject } = parsed.data;
    const phone = parsed.data.phone ? normalizePhone(parsed.data.phone, country) : "";
    const hour = 60 * 60 * 1000;
    const byIp = rateLimit(`contact:ip:${ip}`, { maxAttempts: 5, windowMs: hour });
    const byEmail = email ? rateLimit(`contact:email:${email.toLowerCase()}`, { maxAttempts: 3, windowMs: hour }) : { success: true };
    const byPhone = phone ? rateLimit(`contact:phone:${phone}`, { maxAttempts: 3, windowMs: hour }) : { success: true };
    if (!byIp.success || !byEmail.success || !byPhone.success) {
      return NextResponse.json({ error: "أرسلت عدة رسائل مؤخراً. يمكنك المحاولة مرة أخرى بعد قليل." }, { status: 429 });
    }

    const { message } = parsed.data;
    const session = await auth().catch(() => null);
    await db.contactMessage.create({
      data: { name, email: email || null, phone: phone || null, subject, message, userId: session?.user?.id ?? null, country },
    });
    sendContactNotification({ name, email: email || null, phone: phone || null, subject, message, country }).catch((err) =>
      console.error("Contact notification email failed:", err),
    );

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json({ error: "تعذّر إرسال رسالتك. يمكنك المحاولة مرة أخرى." }, { status: 500 });
  }
}
