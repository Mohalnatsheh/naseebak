/**
 * SMS through Broadnet (Jordan). Arabic text needs type=2 (Unicode) with UTF-16BE hex.
 * Used for OTP codes (send-otp) and the SMS notice fallback (lib/sms-notice.ts).
 * Config: BROADNET_USER, BROADNET_PASS, BROADNET_SENDER_ID, BROADNET_API_URL.
 */

// Encode text as UTF-16BE hex for Broadnet Unicode SMS (type=2)
export function toUnicodeHex(text: string): string {
  return Array.from(text)
    .map((c) => c.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
}

export async function sendSms(phone: string, text: string): Promise<boolean> {
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
