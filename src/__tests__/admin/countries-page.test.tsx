import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import AdminCountriesPage from "@/app/(en)/admin/countries/page";

const settings = {
  code: "SA", active: true, registrationOpen: true, purchasesEnabled: false, pollsEnabled: false, smsProvider: "DEFAULT",
  smsSenderId: null, supportEmail: null, supportPhone: null, supportWhatsapp: null, seoTitle: null, seoDescription: null,
  heroTitle: null, heroSubtitle: null, packagePrices: null, pricesApproved: false, proPlans: null, adminEmails: null,
};

describe("Admin → Countries (design P2)", () => {
  it("puts the readiness checklist first and folds the long parts into sections", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        countries: [
          {
            settings,
            display: { name: { ar: "السعودية", en: "Saudi Arabia" }, flag: { emoji: "" }, dialCode: "+966", currency: { code: "SAR" }, isDefault: false },
            warnings: [],
            sms: { provider: "UNIFONIC", configured: true },
            packages: [],
            pricesApproved: false,
            goLive: [
              { key: "codes", label: "Sign-in codes can be sent", done: true },
              { key: "pricesApproved", label: "Prices set and approved", done: false },
            ],
            selling: false,
            members: { total: 3, active7d: 1, new7d: 1 },
          },
        ],
        server: null,
      }),
    } as Response);
    await act(async () => {
      render(<AdminCountriesPage />);
    });
    const checklist = await screen.findByText("To go live in Saudi Arabia: 1 of 2 done");
    const firstSection = screen.getByText("SMS, contacts and public text");
    // The checklist comes before the sections
    expect(checklist.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Credit packages")).toBeTruthy();
    expect(screen.getByText("Pro plans")).toBeTruthy();
    // Prices not approved: that part opens by itself
    expect(screen.getByText("Credit packages").closest("details")?.open).toBe(true);
    expect(firstSection.closest("details")?.open).toBe(false);
  });
});
