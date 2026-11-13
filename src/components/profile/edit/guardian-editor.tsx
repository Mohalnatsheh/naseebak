"use client";

import { useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChoiceGroup, Field } from "@/components/profile/form-fields";
import { COUNTRIES, type CountryCode } from "@/lib/countries";
import { normalizePhone } from "@/lib/phone";
import { toLatinDigits } from "@/lib/digits";
import { guardianFormIssues, type GuardianFormKey } from "@/lib/validations/form-checks";
import type { Opt } from "@/lib/profile-options";
import { EditorShell } from "./row-editor";
import type { GuardianBody, StoredGuardian } from "./use-edit-session";

/** As the legacy edit page's step 5 */
export const GUARDIAN_RELATIONSHIPS: Opt[] = [
  { value: "father", label: "الأب" },
  { value: "mother", label: "الأم" },
  { value: "brother", label: "الأخ" },
  { value: "guardian", label: "قريب آخر" },
];

const EMPTY = { parentName: "", parentPhone: "", relationship: "", address: "" };
const ID = "edit-guardian";

/**
 * The guardian's editor (the legacy edit page's step 5 in the list's dialog / sheet): name, phone, relationship,
 * address and the consent to share them. «حفظ» saves at once (`PUT /api/profile/parent-info`), never through the
 * save bar. The contact is checked only when it changes, so an older entry never blocks a consent change; in the
 * new cycle an untouched empty guardian is fine (it is asked for at the first family introduction).
 */
export function GuardianEditor({
  stored,
  country,
  introMode,
  myPhone,
  onSave,
  onClose,
}: {
  stored: StoredGuardian | null;
  country: CountryCode;
  introMode: boolean;
  /** The member's own phone: the guardian's must differ */
  myPhone?: string | null;
  onSave: (body: GuardianBody) => Promise<string | null>;
  onClose: () => void;
}) {
  const words = COUNTRIES[country].words;
  const original = stored ?? { ...EMPTY, shareConsent: false };
  const [form, setForm] = useState({
    parentName: original.parentName,
    parentPhone: original.parentPhone,
    relationship: original.relationship,
    address: original.address,
  });
  const [shareConsent, setShareConsent] = useState(original.shareConsent);
  const [issues, setIssues] = useState<Partial<Record<GuardianFormKey, string>>>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: GuardianFormKey, value: string) => {
    setIssues((i) => ({ ...i, [key]: undefined }));
    setServerError("");
    setForm((f) => ({ ...f, [key]: value }));
  };
  const invalid = (key: GuardianFormKey) =>
    issues[key] ? ({ "aria-invalid": true, "aria-describedby": `${ID}-${key}-error` } as const) : {};

  async function save() {
    const contactChanged = (Object.keys(form) as GuardianFormKey[]).some((k) => form[k] !== original[k]);
    if (!contactChanged && shareConsent === original.shareConsent) {
      onClose();
      return;
    }
    if (contactChanged) {
      const found = guardianFormIssues(form, country);
      if (!found.parentPhone && myPhone && normalizePhone(form.parentPhone, country) === myPhone) {
        found.parentPhone = `رقم وليّ الأمر يجب أن يختلف عن رقم ${words.phone}ك`;
      }
      if (Object.keys(found).length > 0) {
        setIssues(found);
        return;
      }
    }
    setSaving(true);
    const error = await onSave({ ...form, shareConsent });
    setSaving(false);
    if (error) setServerError(error);
    else onClose();
  }

  return (
    <EditorShell
      title="وليّ الأمر"
      onClose={onClose}
      actions={
        <>
          <Button type="button" className="h-12 flex-1 rounded-xl font-semibold" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-label="جارٍ الحفظ" /> : "حفظ"}
          </Button>
          <Button type="button" variant="outline" className="h-12 w-28 rounded-xl" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2.5 text-label font-normal leading-relaxed text-primary">
          <Shield className="mt-1 h-4 w-4 shrink-0" aria-hidden />
          {introMode
            ? "بيانات وليّ الأمر سرية، ولا تظهر لأي مستخدم إلا لعائلة الطرف الآخر عند بدء تعارف عائلي على توافق متبادل وبموافقتك. يتم حفظها مباشرة دون الحاجة لمراجعة الإدارة."
            : "هذه البيانات سرية وتستخدم فقط من قبل الإدارة لتنسيق الزيارات العائلية ولن تظهر للمستخدمين الآخرين. يتم حفظها مباشرة دون الحاجة لمراجعة الإدارة."}
        </p>
        {introMode && !original.parentName && (
          <p className="text-caption leading-relaxed text-muted-ink">
            يُطلب وليّ الأمر عند أول تعارف عائلي فقط. يمكنك تركه فارغاً الآن، وإذا بدأت بتعبئته فكل الحقول مطلوبة.
          </p>
        )}
        <Field id={`${ID}-parentName`} label="اسم ولي الأمر" error={issues.parentName}>
          <Input
            id={`${ID}-parentName`}
            className="h-12 rounded-xl text-body"
            value={form.parentName}
            onChange={(e) => set("parentName", e.target.value)}
            placeholder="الاسم الكامل لولي الأمر"
            {...invalid("parentName")}
          />
        </Field>
        <Field id={`${ID}-parentPhone`} label={`رقم ${words.phone} ولي الأمر`} error={issues.parentPhone}>
          <Input
            id={`${ID}-parentPhone`}
            type="tel"
            dir="ltr"
            className="h-12 rounded-xl text-left text-body"
            value={form.parentPhone}
            onChange={(e) => set("parentPhone", toLatinDigits(e.target.value))}
            placeholder={`0${COUNTRIES[country].phone.placeholder}`}
            {...invalid("parentPhone")}
          />
        </Field>
        <Field id={`${ID}-relationship`} label="صلة القرابة" error={issues.relationship}>
          <ChoiceGroup
            id={`${ID}-relationship`}
            cols={2}
            options={GUARDIAN_RELATIONSHIPS}
            isSelected={(v) => v === form.relationship}
            onSelect={(v) => set("relationship", v)}
            error={!!issues.relationship}
          />
        </Field>
        <Field id={`${ID}-address`} label="العنوان" error={issues.address}>
          <textarea
            id={`${ID}-address`}
            rows={3}
            maxLength={500}
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="العنوان التفصيلي (المدينة، الحي، الشارع...)"
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-ring"
            {...invalid("address")}
          />
        </Field>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 text-label font-normal hover:bg-muted/40">
          <input
            type="checkbox"
            checked={shareConsent}
            onChange={(e) => {
              setServerError("");
              setShareConsent(e.target.checked);
            }}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
          />
          <span className="leading-relaxed text-ink">
            أوافق على مشاركة اسم ورقم وليّ الأمر مع عائلة الطرف الآخر فقط عند بدء تعارف عائلي على توافق متبادل.
          </span>
        </label>
        {serverError && (
          <p role="alert" className="text-label font-normal text-destructive">
            {serverError}
          </p>
        )}
      </div>
    </EditorShell>
  );
}
