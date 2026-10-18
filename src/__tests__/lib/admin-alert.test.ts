import { describe, it, expect, vi, beforeEach } from "vitest";

const email = vi.hoisted(() => ({ sendAdminEmail: vi.fn() }));
vi.mock("@/lib/email", () => email);

import { sendAdminAlert } from "@/lib/admin-alert";

beforeEach(() => vi.clearAllMocks());

describe("sendAdminAlert", () => {
  it("sends through the admin email with a site prefix", async () => {
    email.sendAdminEmail.mockResolvedValue(true);
    await sendAdminAlert("بلاغ جديد", "نص");
    expect(email.sendAdminEmail).toHaveBeenCalledWith("[نصيبك] بلاغ جديد", "نص");
  });

  it("never throws: not configured or a failed send is only logged", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    email.sendAdminEmail.mockResolvedValue(false);
    await expect(sendAdminAlert("a", "b")).resolves.toBeUndefined();
    email.sendAdminEmail.mockRejectedValue(new Error("smtp down"));
    await expect(sendAdminAlert("a", "b")).resolves.toBeUndefined();
  });
});
