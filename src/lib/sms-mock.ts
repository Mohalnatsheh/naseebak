/**
 * Mock SMS outbox (local development and tests only). `sendSms` routes here when the country's provider resolves to
 * MOCK, which `mockSmsAllowed()` permits only outside production or in a localhost production build. Messages are kept
 * in memory (last 50, this process only) so a developer or a test can read the sign-up code from
 * `GET /api/dev/sms-outbox` (404 on any real server). The log never contains the text — only a masked number.
 */

export interface MockSms {
  to: string;
  text: string;
  at: string;
}

const MAX = 50;
const store = globalThis as unknown as { __naseebakSmsOutbox?: MockSms[] };

function outbox(): MockSms[] {
  store.__naseebakSmsOutbox ??= [];
  return store.__naseebakSmsOutbox;
}

export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 5)}****${phone.slice(-3)}` : "****";
}

export function sendMockSms(to: string, text: string): true {
  const box = outbox();
  box.unshift({ to, text, at: new Date().toISOString() });
  box.length = Math.min(box.length, MAX);
  console.log(`[SMS mock] kept in the local outbox for ${maskPhone(to)} (${text.length} chars)`);
  return true;
}

/** Newest first; optionally only one number's messages */
export function readMockOutbox(to?: string): MockSms[] {
  return to ? outbox().filter((m) => m.to === to) : [...outbox()];
}

export function clearMockOutbox() {
  outbox().length = 0;
}
