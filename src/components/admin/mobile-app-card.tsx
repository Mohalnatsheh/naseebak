"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SettingsConfirmDialog } from "@/components/admin/settings-confirm-dialog";
import { SettingsNote } from "@/components/admin/settings-section";
import { mobileAppChanges, type ChangeSummary } from "@/lib/admin/settings-changes";
import type { MobilePlatform, MobilePlatformConfig } from "@/lib/mobile-config";
import { versionPairError } from "@/lib/version-compare";

type ArabicCheckout = "off" | "test" | "all";
type Config = Record<MobilePlatform, MobilePlatformConfig> & { paymentsEnabled: boolean; androidCertSha256: string; arabicCheckout?: ArabicCheckout };

const ARABIC_OPTIONS: [ArabicCheckout, string][] = [
  ["off", "Off"],
  ["test", "Test accounts only"],
  ["all", "Everyone"],
];

const PLATFORMS: { key: MobilePlatform; name: string }[] = [
  { key: "android", name: "Android" },
  { key: "ios", name: "iOS (iPhone)" },
];

const EMPTY: MobilePlatformConfig = { minVersion: "", latestVersion: "", storeUrl: "" };

/**
 * Admin → Settings: the mobile app's update gate per platform and its payments switch (src/lib/mobile-config.ts).
 * Required = older versions are blocked until updated; optional = a notice the member may skip.
 * Payments off = no buying in the app (website unchanged); test accounts never see payments in the app.
 */
export function MobileAppCard() {
  const [config, setConfig] = useState<Config>({ android: EMPTY, ios: EMPTY, paymentsEnabled: true, androidCertSha256: "" });
  /** What the server holds: the confirmation compares against this. Null = not loaded, saving is refused. */
  const [loaded, setLoaded] = useState<Config | null>(null);
  const [pending, setPending] = useState<ChangeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings/mobile-app")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Config) => {
        setConfig(d);
        setLoaded(d);
      })
      .catch(() => setError("Could not load the app versions"))
      .finally(() => setLoading(false));
  }, []);

  function set(p: MobilePlatform, field: keyof MobilePlatformConfig, value: string) {
    setSaved(false);
    setConfig((c) => ({ ...c, [p]: { ...c[p], [field]: value } }));
  }

  /** Asks first, naming every change. Nothing changed = nothing to save. */
  function requestSave() {
    if (!loaded) return;
    // Named here before the confirmation; the server refuses it too (ADM-25)
    for (const { key, name } of PLATFORMS) {
      const problem = versionPairError(config[key].minVersion, config[key].latestVersion);
      if (problem) {
        setError(`${name}: ${problem}`);
        toast.error(`${name}: ${problem}`);
        return;
      }
    }
    const changes = mobileAppChanges(loaded, config);
    if (changes.lines.length === 0) {
      toast.info("Nothing changed");
      return;
    }
    setPending(changes);
  }

  async function save() {
    setPending(null);
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/settings/mobile-app", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Save failed");
        toast.error(data.error || "Save failed");
      } else {
        setConfig(data);
        setLoaded(data);
        setSaved(true);
      }
    } catch {
      setError("Save failed");
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          Mobile app
        </CardTitle>
        <CardDescription>
          Required update: older apps are blocked with «حدّث التطبيق» until updated. Optional update: older apps see a
          notice they can skip. Versions look like 1.2.0; leave empty for none.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!loading && (
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <p className="font-medium">Payments in the app</p>
              <p className="text-sm text-muted-foreground">
                {config.paymentsEnabled
                  ? "Members can buy credits in the app (Stripe page). Test accounts never see payments in the app."
                  : "Buying is hidden in the app; members keep their balance and buy on the website."}
              </p>
              <SettingsNote href="/admin/countries" linkText="Countries → Sell credit packages">
                Only for the app. Buying in the app also needs selling on for the member&apos;s country; off there wins, on the website too:
              </SettingsNote>
            </div>
            <Button
              type="button"
              size="sm"
              variant={config.paymentsEnabled ? "default" : "outline"}
              aria-label="Toggle payments in the app"
              onClick={() => {
                setSaved(false);
                setConfig((c) => ({ ...c, paymentsEnabled: !c.paymentsEnabled }));
              }}
            >
              {config.paymentsEnabled ? "Shown" : "Hidden"}
            </Button>
          </div>
        )}
        {!loading && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="space-y-1">
              <p className="font-medium">Arabic payment page</p>
              <p className="text-sm text-muted-foreground">
                Pay on naseebak.com/pay (Arabic, Naseebak&apos;s design) instead of Stripe&apos;s English checkout — website and
                app. «Test accounts only»: try it with a test number on the website first (test accounts never see payments
                in the app). If Stripe refuses, members get the usual checkout.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ARABIC_OPTIONS.map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={(config.arabicCheckout ?? "off") === value ? "default" : "outline"}
                  onClick={() => {
                    setSaved(false);
                    setConfig((c) => ({ ...c, arabicCheckout: value }));
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          PLATFORMS.map(({ key, name }) => (
            <div key={key} className="space-y-3 rounded-lg border p-4">
              <p className="font-medium">{name}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${key}-min`}>Required update (minimum version)</Label>
                  <Input
                    id={`${key}-min`}
                    dir="ltr"
                    placeholder="e.g. 1.0.0"
                    value={config[key].minVersion}
                    aria-invalid={!!versionPairError(config[key].minVersion, config[key].latestVersion)}
                    onChange={(e) => set(key, "minVersion", e.target.value)}
                  />
                  {versionPairError(config[key].minVersion, config[key].latestVersion) && (
                    <p className="text-xs text-destructive">Can&apos;t be above the latest version.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${key}-latest`}>Optional update (latest version)</Label>
                  <Input
                    id={`${key}-latest`}
                    dir="ltr"
                    placeholder="e.g. 1.1.0"
                    value={config[key].latestVersion}
                    onChange={(e) => set(key, "latestVersion", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${key}-store`}>Store link</Label>
                <Input
                  id={`${key}-store`}
                  dir="ltr"
                  placeholder="https://…"
                  value={config[key].storeUrl}
                  onChange={(e) => set(key, "storeUrl", e.target.value)}
                />
              </div>
            </div>
          ))
        )}
        {!loading && (
          <div className="space-y-1.5">
            <Label htmlFor="android-certs">Android signing fingerprints (SHA-256), one per line</Label>
            <textarea
              id="android-certs"
              dir="ltr"
              className="w-full min-h-[72px] rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs"
              placeholder="AB:CD:…  (Play Console → Test and release → App integrity → App signing key certificate)"
              value={config.androidCertSha256}
              onChange={(e) => {
                setSaved(false);
                setConfig((c) => ({ ...c, androidCertSha256: e.target.value }));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Lets naseebak.com member links (SMS, notifications, referral links) open the Android app. Add the Play App
              Signing key, and the upload key for testing. iPhone links work without this.
            </p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={requestSave} disabled={loading || saving || !loaded}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <Check className="h-3.5 w-3.5" /> Saved (apps pick it up within 30 seconds)
            </span>
          )}
        </div>
      </CardContent>
      <SettingsConfirmDialog
        open={!!pending}
        title="Save these changes?"
        description="Apps and the website pick them up within 30 seconds."
        lines={pending?.lines}
        warnings={pending?.warnings}
        destructive={!!pending?.warnings.length}
        onCancel={() => setPending(null)}
        onConfirm={save}
      />
    </Card>
  );
}
