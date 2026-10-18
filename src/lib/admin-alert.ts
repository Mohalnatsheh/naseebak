/**
 * Best-effort alert to the admin inbox (ADMIN_NOTIFY_EMAIL over the SMTP sender in
 * src/lib/email.ts). Never throws: a missing config or a failed send is only logged,
 * so callers can fire it without try/catch (await it or `void` it).
 */
import { sendAdminEmail } from "@/lib/email";

export async function sendAdminAlert(subject: string, text: string): Promise<void> {
  try {
    const sent = await sendAdminEmail(`[نصيبك] ${subject}`, text);
    if (!sent) console.warn(`[admin-alert] SMTP or ADMIN_NOTIFY_EMAIL not configured — skipped: ${subject}`);
  } catch (err) {
    console.error(`[admin-alert] failed to send "${subject}":`, err);
  }
}
