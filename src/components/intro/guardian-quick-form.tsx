"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, ChoiceGroup } from "@/components/profile/form-fields";
import { useDashboardData } from "@/contexts/dashboard-context";
import { parentInfoSchema } from "@/lib/validations/profile";
import { normalizePhone } from "@/lib/validations/auth";
import type { Opt } from "@/lib/profile-options";

const RELATIONSHIPS: Opt[] = [
  { value: "father", label: "الأب" },
  { value: "mother", label: "الأم" },
  { value: "brother", label: "الأخ" },
  { value: "guardian", label: "ولي الأمر" },
];

type FormKey = "parentName" | "parentPhone" | "relationship" | "address";

/**
 * New cycle: the guardian isn't asked for at setup, only when it is needed. Shown inside the
 * family-introduction dialogs and the mixed-match share prompt: saves the contact with share consent
 * (it is filled in for exactly this purpose), then `onSaved` lets the caller continue.
 */
export function GuardianQuickForm({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const { profile, refreshProfile, refreshUnread } = useDashboardData();
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
    const parsed = parentInfoSchema.safeParse(form);
    const next: Partial<Record<FormKey, string>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as FormKey;
        if (!next[key]) next[key] = issue.message;
      }
    }
    if (!next.parentPhone && profile?.phone && normalizePhone(form.parentPhone) === profile.phone) {
      next.parentPhone = "رقم وليّ الأمر يجب أن يختلف عن رقم هاتفك";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/profile/parent-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, shareConsent: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "تعذّر حفظ بيانات وليّ الأمر، حاول مرة أخرى");
        return;
      }
      await Promise.all([refreshProfile(), refreshUnread()]);
      await onSaved();
    } catch {
      setError("تعذّر حفظ بيانات وليّ الأمر، حاول مرة أخرى");
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
      <Field id="gq-parentName" label="اسم ولي الأمر" error={errors.parentName}>
        <Input id="gq-parentName" value={form.parentName} onChange={(e) => update("parentName", e.target.value)} placeholder="الاسم الكامل لولي الأمر" aria-invalid={!!errors.parentName} />
      </Field>
      <Field id="gq-parentPhone" label="رقم هاتف ولي الأمر" error={errors.parentPhone}>
        <Input id="gq-parentPhone" type="tel" value={form.parentPhone} onChange={(e) => update("parentPhone", e.target.value)} placeholder="07XXXXXXXX" dir="ltr" className="text-left" aria-invalid={!!errors.parentPhone} />
      </Field>
      <Field id="gq-relationship" label="صلة القرابة" error={errors.relationship}>
        <ChoiceGroup id="gq-relationship" cols={2} options={RELATIONSHIPS} isSelected={(v) => form.relationship === v} onSelect={(v) => update("relationship", v)} error={!!errors.relationship} />
      </Field>
      <Field id="gq-address" label="العنوان" error={errors.address}>
        <Input id="gq-address" value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="المدينة والحي" aria-invalid={!!errors.address} />
      </Field>
      <p className="text-xs text-muted-foreground">بحفظ البيانات أوافق على مشاركة اسم ورقم وليّ الأمر مع عائلة الطرف الآخر فقط عند التعارف العائلي.</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="button" size="sm" onClick={save} disabled={busy} className="w-full gap-1.5">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        حفظ بيانات وليّ الأمر
      </Button>
    </div>
  );
}
