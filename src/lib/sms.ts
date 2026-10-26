/**
 * SMS, routed by the number's country (multi-country 2026-10-26):
 *   Jordan (962…)        → Broadnet. Arabic text needs type=2 (Unicode) with UTF-16BE hex.
 *                          Config: BROADNET_USER, BROADNET_PASS, BROADNET_SENDER_ID, BROADNET_API_URL.
 *   Saudi Arabia (966…)  → Unifonic REST. Config: UNIFONIC_APP_SID, UNIFONIC_SENDER_ID (a sender name
 *                          registered with CST), UNIFONIC_API_URL. `[NEEDS INPUT]` account — untested until set.
 * A country with no configured provider returns false (send-otp answers 502, notices are skipped).
 * Used for OTP codes (send-otp) and the SMS notice fallback (lib/sms-notice.ts).
 */
import { countryOfPhone } from "@/lib/countries";

export async function sendSms(phone: string, text: string): Promise<boolean> {
  const country = countryOfPhone(phone);
  if (country === "SA") return sendUnifonic(phone, text);
  if (country === "JO") return sendBroadnet(phone, text);
  console.error(`[SMS] No SMS provider for ${phone}`);
  return false;
}

/** Saudi Arabia — Unifonic (https://el.cloud.unifonic.com/rest/SMS/messages) */
async function sendUnifonic(phone: string, text: string): Promise<boolean> {
  const appSid = process.env.UNIFONIC_APP_SID;
  const sender = process.env.UNIFONIC_SENDER_ID;
  if (!appSid || !sender) {
    console.error("[SMS] UNIFONIC_APP_SID / UNIFONIC_SENDER_ID are not configured (Saudi numbers)");
    return false;
  }
  try {
    const res = await fetch(process.env.UNIFONIC_API_URL || "https://el.cloud.unifonic.com/rest/SMS/messages", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ AppSid: appSid, SenderID: sender, Recipient: phone, Body: text, responseType: "JSON" }).toString(),
    });
    const body = await res.text();
    console.log(`[SMS] Unifonic response for ${phone}: status=${res.status} body="${body.slice(0, 200)}"`);
    if (!res.ok) return false;
    try {
      const j = JSON.parse(body) as { success?: boolean | string };
      return j.success === true || j.success === "true";
    } catch {
      return false;
    }
  } catch (err) {
    console.error("[SMS] Unifonic send error:", err);
    return false;
  }
}

// Encode text as UTF-16BE hex for Broadnet Unicode SMS (type=2)
export function toUnicodeHex(text: string): string {
  return Array.from(text)
    .map((c) => c.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
}

/** Jordan — Broadnet */
async function sendBroadnet(phone: string, text: string): Promise<boolean> {
  const user = process.env.BROADNET_USER;
  const pass = process.env.BROADNET_PASS;
  if (!user || !pass) {
    console.error("[SMS] BROADNET_USER / BROADNET_PASS are not configured");
    return false;
  }

  try {
    const params = new URLSearchParams({
      user,
      pass,
      sid: process.env.BROADNET_SENDER_ID || "naseebak",
      mno: phone,
      type: "2",
      text: toUnicodeHex(text),
    });

    const baseUrl =
      process.env.BROADNET_API_URL || "https://gwjo1s.broadnet.me:8443/websmpp/websms";
    const res = await fetch(`${baseUrl}?${params.toString()}`);

    const body = await res.text();
    console.log(`[SMS] Broadnet response for ${phone}: status=${res.status} body="${body}"`);

    if (!res.ok) {
      console.error(`[SMS] Broadnet HTTP error ${res.status}:`, body);
      return false;
    }

    // Broadnet returns "Response: <messageId>" on success, error messages otherwise
    if (!body.includes("Response:")) {
      console.error(`[SMS] Broadnet rejected message for ${phone}:`, body);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[SMS] Send error:", err);
    return false;
  }
}
