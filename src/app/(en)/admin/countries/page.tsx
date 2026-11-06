"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Circle, Globe2, Loader2, Send, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CountryFlag } from "@/components/shared/country-flag";
import { SettingsConfirmDialog } from "@/components/admin/settings-confirm-dialog";
import { SettingsNote } from "@/components/admin/settings-section";
import { countryChanges, type ChangeSummary } from "@/lib/admin/settings-changes";
import { toast } from "sonner";
import { formatCharge, packagesFor } from "@/lib/payments/packages";
import type { CountryCode } from "@/lib/countries";

type Provider = "DEFAULT" | "BROADNET" | "UNIFONIC" | "MOCK" | "NONE";

interface Settings {
  code: string;
  active: boolean;
  registrationOpen: boolean;
  purchasesEnabled: boolean;
  pollsEnabled: boolean;
  smsProvider: Provider;
  smsSenderId: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  supportWhatsapp: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  packagePrices: Record<string, number> | null;
  pricesApproved: boolean | null;
  adminEmails: string | null;
}

interface CountryRow {
  settings: Settings;
  display: { name: { ar: string; en: string }; flag: { emoji: string }; dialCode: string; currency: { code: string }; isDefault: boolean };
  warnings: { level: "error" | "warning"; message: string }[];
  sms: { provider: string; configured: boolean };
  packages: { id: string; credits: number; price: number; currency: string }[];
  pricesApproved: boolean;
  goLive: { key: string; label: string; done: boolean }[];
  selling: boolean;
  members: { total: number; active7d: number; new7d: number };
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "DEFAULT", label: "Default (Jordan: Broadnet · Saudi Arabia: Unifonic)" },
  { value: "BROADNET", label: "Broadnet" },
  { value: "UNIFONIC", label: "Unifonic" },
  { value: "MOCK", label: "Mock (local testing only — refused on real servers)" },
  { value: "NONE", label: "None (no SMS)" },
];

const TEXT_FIELDS: { key: keyof Settings; label: string; max: number; placeholder: string; dir?: "rtl" | "ltr" }[] = [
  { key: "heroTitle", label: "Landing headline", max: 80, placeholder: "Built-in headline", dir: "rtl" },
  { key: "heroSubtitle", label: "Landing sub-headline", max: 300, placeholder: "Built-in text", dir: "rtl" },
  { key: "seoTitle", label: "SEO title", max: 70, placeholder: "Built-in title", dir: "rtl" },
  { key: "seoDescription", label: "SEO description", max: 170, placeholder: "Built-in description", dir: "rtl" },
  { key: "adminEmails", label: "Admin emails, comma separated (new members, reports, messages)", max: 500, placeholder: "From the server settings", dir: "ltr" },
  { key: "supportEmail", label: "Support email", max: 120, placeholder: "info@naseebak.com", dir: "ltr" },
  { key: "supportPhone", label: "Support phone", max: 20, placeholder: "+962 …", dir: "ltr" },
  { key: "supportWhatsapp", label: "Support WhatsApp", max: 20, placeholder: "+962 …", dir: "ltr" },
  { key: "smsSenderId", label: "SMS sender id (optional override)", max: 11, placeholder: "From the server settings", dir: "ltr" },
];

/** Admin → Countries: each country's availability, SMS provider, public content and what is still missing. */
export default function AdminCountriesPage() {
  const [rows, setRows] = useState<CountryRow[]>([]);
  const [server, setServer] = useState<{ broadnet: boolean; unifonic: boolean; stripe: boolean; smsMock: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/countries");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setRows(data.countries ?? []);
      setServer(data.server ?? null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load countries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold">
          <Globe2 className="h-7 w-7 text-primary" /> Countries
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Availability, SMS provider and public content per country. Changes apply within 30 seconds. Provider passwords and keys live in the
          server&apos;s environment only and are never shown here.
        </p>
      </div>

      {server && (
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ["Broadnet credentials", server.broadnet],
            ["Unifonic credentials", server.unifonic],
            ["Stripe key", server.stripe],
          ].map(([label, ok]) => (
            <span key={String(label)} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1", ok ? "border-emerald-300 text-emerald-700" : "border-border text-muted-foreground")}>
              {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {label}: {ok ? "set" : "not set"}
            </span>
          ))}
          {server.smsMock && <span className="rounded-full border border-amber-300 px-2.5 py-1 text-amber-800">SMS mock is on for this server (local testing)</span>}
        </div>
      )}

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {loading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      ) : (
        rows.map((row) => <CountryCard key={row.settings.code} row={row} onSaved={load} />)
      )}
    </div>
  );
}

function CountryCard({ row, onSaved }: { row: CountryRow; onSaved: () => void }) {
  const [form, setForm] = useState<Settings>(row.settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [pending, setPending] = useState<ChangeSummary | null>(null);
  const code = row.settings.code;
  const [priceTexts, setPriceTexts] = useState<Record<string, string>>(() => Object.fromEntries(row.packages.map((p) => [p.id, String(p.price)])));
  const approved = form.pricesApproved ?? row.pricesApproved;
  const dirty = JSON.stringify(form) !== JSON.stringify(row.settings);

  /** Always asks first, naming every change (only a cleared-and-retyped field has none to name) */
  function requestSave() {
    const changes = countryChanges(row.settings, form, row.display.name.en, row.packages, row.pricesApproved);
    if (changes.lines.length === 0) save();
    else setPending(changes);
  }

  async function save() {
    setPending(null);
    setSaving(true);
    setMessage(null);
    const body: Partial<Settings> = { ...form };
    delete body.code;
    if (!body.packagePrices) delete body.packagePrices;
    if (body.pricesApproved == null) delete body.pricesApproved;
    const res = await fetch(`/api/admin/countries/${code}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setSaving(false);
    if (!res?.ok) {
      setMessage({ ok: false, text: data?.error || "Could not save" });
      toast.error(data?.error || "Could not save");
      return;
    }
    setMessage({ ok: true, text: "Saved" });
    onSaved();
  }

  /** Every package's price goes along in one order, so a saved form reads the same as what comes back */
  function setPrice(id: string, text: string) {
    const texts = { ...priceTexts, [id]: text };
    setPriceTexts(texts);
    setForm({ ...form, packagePrices: Object.fromEntries(row.packages.map((p) => [p.id, Number(texts[p.id])])) });
  }

  async function sendTest() {
    setTesting(true);
    setMessage(null);
    const res = await fetch(`/api/admin/countries/${code}/test-sms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: testPhone }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setTesting(false);
    if (!res?.ok) setMessage({ ok: false, text: data?.error || "Test failed" });
    else setMessage({ ok: !!data.sent, text: data.sent ? `Test SMS accepted by ${data.provider} for ${data.to}` : `${data.provider} did not accept the test SMS (see server log)` });
  }

  const toggle = (key: "active" | "registrationOpen" | "purchasesEnabled" | "pollsEnabled", label: string, hint: string, disabled = false, note?: ReactNode) => (
    <div className={cn("space-y-2 rounded-lg border p-3", disabled && "opacity-60")}>
      <label className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
        <Switch checked={!!form[key]} disabled={disabled} onCheckedChange={(v) => setForm({ ...form, [key]: v })} />
      </label>
      {note}
    </div>
  );

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <CountryFlag country={code as CountryCode} className="h-[18px] w-6" />
          {row.display.name.en} <span dir="rtl" className="text-base font-normal text-muted-foreground">({row.display.name.ar})</span>
          <span className="text-sm font-normal text-muted-foreground">· {code} · {row.display.dialCode} · {row.display.currency.code}</span>
          {row.display.isDefault && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Default</span>}
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", row.settings.active ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>
            {row.settings.active ? "Active" : "Inactive"}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Members: <b className="text-foreground">{row.members.total}</b> · active in 7 days {row.members.active7d} · new in 7 days {row.members.new7d} · SMS goes through{" "}
          <b className="text-foreground">{row.sms.provider}</b> {row.sms.provider !== "NONE" && (row.sms.configured ? "(credentials set)" : "(credentials missing)")} · selling: {row.selling ? "yes" : "no"}
        </p>
        {row.warnings.length > 0 && (
          <ul className="space-y-1">
            {row.warnings.map((w) => (
              <li key={w.message} className={cn("flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs", w.level === "error" ? "bg-destructive/10 text-destructive" : "bg-amber-50 text-amber-800")}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w.message}
              </li>
            ))}
          </ul>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          {toggle("active", "Active", "Shown to visitors and in the app; takes sign-ups", row.display.isDefault && form.active)}
          {toggle("registrationOpen", "Registration open", "New members can sign up (existing members can always sign in)", false,
            <SettingsNote href="/admin/settings" linkText="Settings → User Registration">Needs the global switch on too; closed there wins for every country:</SettingsNote>,
          )}
          {toggle("purchasesEnabled", "Sell credit packages", row.pricesApproved ? "Members can buy this country's packages" : "Prices are not approved yet (Packages below) — nothing is sold even if on", false,
            <SettingsNote href="/admin/settings#mobile-app" linkText="Settings → Payments in the app">Website and app. Off here wins; on here, buying in the app also needs:</SettingsNote>,
          )}
          {toggle("pollsEnabled", "«سؤال نصيبك»", "Members of this country see and answer the question", false,
            <SettingsNote href="/admin/polls" linkText="Polls page">Signed-in members only (visitors on /poll still see it). Needs the global switch on; off there hides it for everyone:</SettingsNote>,
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`sms-${code}`}>SMS provider</Label>
          <select id={`sms-${code}`} value={form.smsProvider} onChange={(e) => setForm({ ...form, smsProvider: e.target.value as Provider })} className="h-9 w-full rounded-md border bg-background px-2 text-sm md:w-96">
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`${f.key}-${code}`}>{f.label}</Label>
              <Input
                id={`${f.key}-${code}`}
                dir={f.dir}
                maxLength={f.max}
                value={(form[f.key] as string | null) ?? ""}
                placeholder={f.placeholder.replace("+962", row.display.dialCode)}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Prices approved</span>
              <span className="block text-xs text-muted-foreground">Nothing is sold in {row.display.name.en} until this is on. Checkouts already open keep their price.</span>
            </span>
            <Switch checked={approved} onCheckedChange={(v) => setForm({ ...form, pricesApproved: v })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {packagesFor(code, form.packagePrices).map((p) => (
              <div key={p.id} className="space-y-1.5">
                <Label htmlFor={`${p.id}-price`}>{p.credits} credits ({p.currency})</Label>
                <Input id={`${p.id}-price`} dir="ltr" type="number" min={1} step="any" inputMode="decimal" value={priceTexts[p.id] ?? ""} onChange={(e) => setPrice(p.id, e.target.value)} />
                {p.chargeCurrency === "usd" && <p className="text-xs text-muted-foreground">Card is charged {formatCharge(p)}</p>}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Used on the website, in the app and in the FAQ. Prices written inside blog posts don&apos;t change by themselves.</p>
        </div>

        {!row.selling && row.goLive.length > 0 && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">To go live in {row.display.name.en}</p>
            <ul className="grid gap-1 text-xs sm:grid-cols-2">
              {row.goLive.map((item) => (
                <li key={item.key} className={cn("flex items-center gap-1.5", item.done ? "text-emerald-700" : "text-muted-foreground")}>
                  {item.done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3.5 w-3.5 shrink-0" />} {item.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <Button onClick={requestSave} disabled={!dirty || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save {row.display.name.en}
          </Button>
          <div className="ms-auto flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`test-${code}`}>Send a test SMS</Label>
              <Input id={`test-${code}`} dir="ltr" className="w-44" placeholder={code === "SA" ? "05XXXXXXXX" : "07XXXXXXXX"} value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
            </div>
            <Button variant="outline" onClick={sendTest} disabled={testing || !testPhone.trim()}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
            </Button>
          </div>
        </div>
        {message && <p className={cn("text-sm", message.ok ? "text-emerald-700" : "text-destructive")}>{message.text}</p>}
      </CardContent>
      <SettingsConfirmDialog
        open={!!pending}
        title={`Save ${row.display.name.en}?`}
        description="Changes apply within 30 seconds."
        lines={pending?.lines}
        warnings={pending?.warnings}
        confirmLabel={pending?.warnings.length ? "Yes, save anyway" : "Save"}
        destructive={!!pending?.warnings.length}
        onCancel={() => setPending(null)}
        onConfirm={save}
      />
    </Card>
  );
}
