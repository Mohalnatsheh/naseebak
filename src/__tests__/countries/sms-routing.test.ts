import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const settings = vi.hoisted(() => ({ provider: "DEFAULT" as string, senderId: null as string | null }));
vi.mock("@/lib/countries/settings", async (orig) => {
  const real = await orig<typeof import("@/lib/countries/settings")>();
  return {
    ...real,
    getCountrySettings: async (code: "JO" | "SA") => ({ ...real.defaultCountrySettings(code), smsProvider: settings.provider, smsSenderId: settings.senderId }),
  };
});

import { otpChannel, sendOtpCode, sendSms } from "@/lib/sms";
import { clearMockOutbox, readMockOutbox } from "@/lib/sms-mock";

const fetchMock = vi.fn();
const saved = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  clearMockOutbox();
  settings.provider = "DEFAULT";
  settings.senderId = null;
  process.env.SMS_MOCK = "";
  process.env.BROADNET_USER = "u";
  process.env.BROADNET_PASS = "p";
  process.env.UNIFONIC_APP_SID = "sid";
  process.env.UNIFONIC_SENDER_ID = "Naseebak";
});
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

describe("sendSms routes by the number's country and the country's setting", () => {
  it("Jordan → Broadnet, Saudi Arabia → Unifonic (DEFAULT)", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "Response: 123" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await sendSms("962791234567", "code 123456")).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain("broadnet");
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ success: true }) });
    expect(await sendSms("966551234567", "code 123456")).toBe(true);
    expect(String(fetchMock.mock.calls[1][0])).toContain("unifonic");
    expect(String(fetchMock.mock.calls[1][1].body)).toContain("SenderID=Naseebak");
    log.mockRestore();
  });

  it("a per-country sender id overrides the env one", async () => {
    settings.senderId = "NaseebakSA";
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ success: "true" }) });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendSms("966551234567", "hi");
    expect(String(fetchMock.mock.calls[0][1].body)).toContain("SenderID=NaseebakSA");
    log.mockRestore();
  });

  it("NONE sends nothing and fails", async () => {
    settings.provider = "NONE";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendSms("966551234567", "hi")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("the mock keeps the message locally, never calls a provider, and never logs the text", async () => {
    process.env.SMS_MOCK = "true";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await sendSms("962791234567", "رمز التحقق: 654321")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readMockOutbox("962791234567")[0].text).toContain("654321");
    expect(log.mock.calls.flat().join(" ")).not.toContain("654321");
    log.mockRestore();
  });

  it("an unknown country fails without a provider call", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendSms("441234567890", "hi")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("sendOtpCode: Saudi codes by WhatsApp", () => {
  const ok = { ok: true, status: 200, json: async () => ({ status: "success", message_id: "m1", code: "123456" }) };

  beforeEach(() => {
    process.env.VERIFYWAY_API_KEY = "key";
  });

  it("sends a Saudi code through VerifyWay in Arabic", async () => {
    fetchMock.mockResolvedValue(ok);
    expect(await sendOtpCode("966551234567", "123456")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.verifyway.com/api/v1/");
    expect(init.headers.Authorization).toBe("Bearer key");
    expect(JSON.parse(init.body)).toEqual({ recipient: "+966551234567", type: "otp", code: "123456", channel: "whatsapp", lang: "ar" });
    expect(await otpChannel("966551234567")).toBe("whatsapp");
  });

  it("keeps Jordan on SMS", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "Response: 1" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await sendOtpCode("962791234567", "123456")).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain("broadnet");
    expect(await otpChannel("962791234567")).toBe("sms");
    log.mockRestore();
  });

  it("stays on SMS without a key", async () => {
    process.env.VERIFYWAY_API_KEY = "";
    expect(await otpChannel("966551234567")).toBe("sms");
  });

  it("reports a refusal and never logs the code", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Invalid Phone Number Format" }) });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendOtpCode("966551234567", "123456")).toBe(false);
    expect(JSON.stringify(err.mock.calls)).not.toContain("123456");
    err.mockRestore();
  });
});
