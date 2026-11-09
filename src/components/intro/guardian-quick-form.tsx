"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, ChoiceGroup } from "@/components/profile/form-fields";
import { useCountry, useDashboardData } from "@/contexts/dashboard-context";
import { parentInfoSchemaFor } from "@/lib/validations/profile";
import { normalizePhone } from "@/lib/phone";
import type { Opt } from "@/lib/profile-options";

const RELATIONSHIPS: Opt[] = [
  { value: "father", label: "الأب" },
  { value: "mother", label: "الأم" },
  { value: "brother", label: "الأخ" },
  { value: "guardian", label: "قريب آخر" },
];

type FormKey = "parentName" | "parentPhone" | "relationship" | "address";

/**
 * New cycle: the guardian isn't asked for at setup, only when it is needed. Shown inside the
 * family-introduction dialogs and the mixed-match share prompt, then `onSaved` lets the caller continue.
 * `shareConsent` (default) saves it with share consent; `shareConsent={false}` saves only the contact and
 * the caller's action (send / accept / share) records the consent once it goes through, so a cancelled
 * dialog never leaves a consent behind.
 */
export function GuardianQuickForm({
  onSaved,
  shareConsent = true,
  note,
}: {
  onSaved: () => void | Promise<void>;
  shareConsent?: boolean;
  /** Replaces the consent line under the form (e.g. when saving is itself the share) */
  note?: string;
}) {
  const { profile, refreshProfile, refreshUnread } = useDashboardData();
  // The guardian must be a mobile of the member's own country («هاتف» 07… / «جوال» 05…)
  const country = useCountry();
  const [form, setForm] = useState<Record<FormKey, string>>({ parentName: "", parentPhone: "", relationship: "", address: "" });
  const [errors, setErrors] = useState<Partial<Record<FormKey, string>>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (key: FormKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function save() {
    if (busy) return;
    // Same rules as the API (the other family sees this contact)
    const parsed = parentInfoSchemaFor(country.code).safeParse(form);
    const next: Partial<Record<FormKey, string>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as FormKey;
        if (!next[key]) next[key] = issue.message;
      }
    }
    if (!next.parentPhone && profile?.phone && normalizePhone(form.parentPhone, country.code) === profile.phone) {
      next.parentPhone = `رقم وليّ الأمر يجب أن يختلف عن رقم ${country.words.phone}ك`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/profile/parent-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Without `shareConsent` the stored consent is left as it is (none for a new guardian)
        body: JSON.stringify(shareConsent ? { ...form, shareConsent: true } : form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "تعذّر حفظ بيانات وليّ الأمر، يمكنك المحاولة مرة أخرى");
        return;
      }
      await Promise.all([refreshProfile(), refreshUnread()]);
      await onSaved();
    } catch {
      setError("تعذّر حفظ بيانات وليّ الأمر، يمكنك المحاولة مرة أخرى");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
        <p className="leading-relaxed text-foreground/80">
          للتعارف العائلي نحتاج بيانات وليّ الأمر. تبقى سرية، ولا تظهر إلا لعائلة الطرف الآخر عند تعارف عائلي على توافق متبادل.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">كل الحقول مطلوبة، ومنها العنوان.</p>
      <Field id="gq-parentName" label="اسم ولي الأمر" error={errors.parentName}>
        <Input id="gq-parentName" value={form.parentName} onChange={(e) => update("parentName", e.target.value)} placeholder="الاسم الكامل لولي الأمر" aria-invalid={!!errors.parentName} />
      </Field>
      <Field id="gq-parentPhone" label={`رقم ${country.words.phone} ولي الأمر`} error={errors.parentPhone}>
        <Input id="gq-parentPhone" type="tel" value={form.parentPhone} onChange={(e) => update("parentPhone", e.target.value)} placeholder={`0${country.phone.placeholder}`} dir="ltr" className="text-left" aria-invalid={!!errors.parentPhone} />
      </Field>
      <Field id="gq-relationship" label="صلة القرابة" error={errors.relationship}>
        <ChoiceGroup id="gq-relationship" cols={2} options={RELATIONSHIPS} isSelected={(v) => form.relationship === v} onSelect={(v) => update("relationship", v)} error={!!errors.relationship} />
      </Field>
      <Field id="gq-address" label="العنوان" error={errors.address}>
        <Input id="gq-address" value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="المدينة والحي" aria-invalid={!!errors.address} />
      </Field>
      <p className="text-xs text-muted-foreground">
        {note ?? (shareConsent
          ? "بحفظ البيانات أوافق على مشاركة اسم ورقم وليّ الأمر مع عائلة الطرف الآخر فقط عند التعارف العائلي."
          : "لا تُشارَك البيانات إلا بعد موافقتك في الخطوة التالية.")}
      </p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="button" size="sm" onClick={save} disabled={busy} className="w-full gap-1.5">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        حفظ بيانات وليّ الأمر
      </Button>
    </div>
  );
}
