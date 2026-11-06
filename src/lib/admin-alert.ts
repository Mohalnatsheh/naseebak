/**
 * Best-effort alert to a country's admins (Admin → Countries, over the SMTP sender in
 * src/lib/email.ts). Never throws: a missing config or a failed send is only logged,
 * so callers can fire it without try/catch (await it or `void` it).
 * Pass the member it is about, or the country; a system alert passes neither and goes to Jordan's admins.
 */
import { db } from "@/lib/db";
import { sendAdminEmail } from "@/lib/email";

async function memberCountry(userId: string): Promise<string | null> {
  try {
    return (await db.user.findUnique({ where: { id: userId }, select: { country: true } }))?.country ?? null;
  } catch (err) {
    console.error("[admin-alert] member country unavailable:", err);
    return null;
  }
}

export async function sendAdminAlert(subject: string, text: string, about: { userId?: string | null; country?: string | null } = {}): Promise<void> {
  try {
    const country = about.country ?? (about.userId ? await memberCountry(about.userId) : null);
    const sent = await sendAdminEmail(`[نصيبك] ${subject}`, text, country);
    if (!sent) console.warn(`[admin-alert] SMTP or admin emails not configured — skipped: ${subject}`);
  } catch (err) {
    console.error(`[admin-alert] failed to send "${subject}":`, err);
  }
}
