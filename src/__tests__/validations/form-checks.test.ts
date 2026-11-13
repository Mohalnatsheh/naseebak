import { describe, it, expect } from "vitest";
import { contactFormIssue, guardianFormIssues, type GuardianFormKey } from "@/lib/validations/form-checks";
import { contactSchemaFor } from "@/lib/validations/contact";
import { parentInfoSchemaFor } from "@/lib/validations/profile";

/** The zod schema's first issue, in the same shape */
function zodContact(v: Record<string, string>, country: "JO" | "SA") {
  const r = contactSchemaFor(country).safeParse(v);
  return r.success ? null : { field: String(r.error.issues[0].path[0]), message: r.error.issues[0].message };
}

function zodGuardian(v: Record<GuardianFormKey, string>, country: "JO" | "SA") {
  const r = parentInfoSchemaFor(country).safeParse(v);
  const out: Partial<Record<GuardianFormKey, string>> = {};
  if (!r.success) for (const i of r.error.issues) out[i.path[0] as GuardianFormKey] ??= i.message;
  return out;
}

const okContact = { name: "سارة", email: "", phone: "0791234567", subject: "سؤال", message: "أريد أن أسأل عن الاشتراك", website: "" };

describe("zod-free form checks agree with the server schemas (QA WC-19 / WA-10)", () => {
  it.each([
    ["ok", okContact, "JO"],
    ["short name", { ...okContact, name: "س" }, "JO"],
    ["bad email", { ...okContact, email: "x@y" }, "JO"],
    ["email with a double dot", { ...okContact, email: "a..b@x.com" }, "JO"],
    ["email with an Arabic domain", { ...okContact, email: "a@بريد.com" }, "JO"],
    ["email ending in a dot", { ...okContact, email: "a.@x.com" }, "JO"],
    ["email with a one-letter TLD", { ...okContact, email: "a@x.c" }, "JO"],
    ["bad phone", { ...okContact, phone: "12345" }, "JO"],
    ["Arabic digits phone", { ...okContact, phone: "٠٧٩١٢٣٤٥٦٧" }, "JO"],
    ["Saudi phone in SA", { ...okContact, phone: "0512345678" }, "SA"],
    ["Jordanian phone in SA", { ...okContact, phone: "0791234567" }, "SA"],
    ["no way to reply", { ...okContact, phone: "", email: "" }, "SA"],
    ["email only", { ...okContact, phone: "", email: "a@b.com" }, "JO"],
    ["short subject", { ...okContact, subject: "a" }, "JO"],
    ["short message", { ...okContact, message: "قصير" }, "JO"],
    ["honeypot", { ...okContact, website: "x" }, "JO"],
  ] as const)("contact: %s", (_label, v, country) => {
    const mine = contactFormIssue(v, country);
    const theirs = zodContact(v, country);
    expect(mine?.field ?? null).toBe(theirs?.field ?? null);
    if (theirs && theirs.field !== "website") expect(mine?.message).toBe(theirs.message);
  });

  const okGuardian = { parentName: "أبو أحمد", parentPhone: "0791234567", relationship: "father", address: "عمان، خلدا" };
  it.each([
    ["ok", okGuardian, "JO"],
    ["empty", { parentName: "", parentPhone: "", relationship: "", address: "" }, "JO"],
    ["Latin name", { ...okGuardian, parentName: "Ahmad" }, "JO"],
    ["Saudi number in JO", { ...okGuardian, parentPhone: "0512345678" }, "JO"],
    ["Saudi ok", { ...okGuardian, parentPhone: "0512345678" }, "SA"],
    ["short address", { ...okGuardian, address: "عم" }, "JO"],
    ["no address", { ...okGuardian, address: "" }, "JO"],
    ["long address", { ...okGuardian, address: "ع".repeat(301) }, "JO"],
    ["empty phone", { ...okGuardian, parentPhone: "" }, "SA"],
  ] as const)("guardian: %s", (_label, v, country) => {
    expect(guardianFormIssues(v, country)).toEqual(zodGuardian(v, country));
  });

  it("the guardian address is optional (owner, 2026-11-13)", () => {
    expect(guardianFormIssues({ ...okGuardian, address: "" }, "JO")).toEqual({});
    expect(guardianFormIssues({ ...okGuardian, address: "ع".repeat(301) }, "JO").address).toBe("العنوان طويل جداً");
  });

  it("an empty guardian phone is «مطلوب», not «غير صالح» (QA WM-10)", () => {
    expect(guardianFormIssues({ ...okGuardian, parentPhone: "" }, "JO").parentPhone).toBe("رقم هاتف ولي الأمر مطلوب");
    expect(guardianFormIssues({ ...okGuardian, parentPhone: "079" }, "JO").parentPhone).toContain("غير صالح");
  });
});
