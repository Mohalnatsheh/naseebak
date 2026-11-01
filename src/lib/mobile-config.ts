/**
 * App version gate for the mobile app (`GET /api/mobile/config`, Admin → Settings → Mobile app versions).
 * Below `minVersion` the app shows a full-screen «حدّث التطبيق» and nothing else; below `latestVersion` a dismissible
 * «تحديث متوفر». Empty = no gate. Stored in system_settings (30 s cache), so raising a version needs no deploy.
 *
 * Also the app-only payments switch: buying credits can be hidden in the app (the website is unaffected), and it is
 * always hidden for test accounts — the logins given to the App Store / Google Play reviewers.
 */
import { getMaintenanceState, getSetting, setSetting } from "@/lib/settings";
import { isTestPhone } from "@/lib/test-accounts";

export const MOBILE_PLATFORMS = ["android", "ios"] as const;
export type MobilePlatform = (typeof MOBILE_PLATFORMS)[number];

export interface MobilePlatformConfig {
  /** Oldest version allowed to run ("1.2.0"); "" = any */
  minVersion: string;
  /** Newest version in the store, for the optional notice; "" = none */
  latestVersion: string;
  /** Store page the update button opens */
  storeUrl: string;
}

const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/** Play Store page by default (same id as the Android build); the App Store link is set once the app is listed */
const DEFAULT_STORE_URL: Record<MobilePlatform, string> = {
  android: "https://play.google.com/store/apps/details?id=com.naseebak.naseebakApp",
  ios: "",
};

const key = (platform: MobilePlatform, field: keyof MobilePlatformConfig) =>
  `mobile_${platform}_${field === "minVersion" ? "min_version" : field === "latestVersion" ? "latest_version" : "store_url"}`;

export function isVersion(v: string): boolean {
  return VERSION.test(v);
}

export async function getMobileConfig(): Promise<Record<MobilePlatform, MobilePlatformConfig>> {
  const entries = await Promise.all(
    MOBILE_PLATFORMS.map(async (p) => {
      const [minVersion, latestVersion, storeUrl] = await Promise.all([
        getSetting(key(p, "minVersion")),
        getSetting(key(p, "latestVersion")),
        getSetting(key(p, "storeUrl")),
      ]);
      return [
        p,
        {
          minVersion: isVersion(minVersion) ? minVersion : "",
          latestVersion: isVersion(latestVersion) ? latestVersion : "",
          storeUrl: storeUrl || DEFAULT_STORE_URL[p],
        },
      ] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<MobilePlatform, MobilePlatformConfig>;
}

/** Maintenance mode (Admin → Settings) for the app: members see a full-screen page with the admin's message */
export async function getMobileMaintenance(): Promise<{ enabled: boolean; message: string }> {
  const { enabled, message } = await getMaintenanceState();
  return { enabled, message: enabled ? message.trim() : "" };
}

const PAYMENTS_KEY = "mobile_payments_enabled";
const ANDROID_CERTS_KEY = "mobile_android_cert_sha256";
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** App Links / Universal Links: naseebak.com member pages (`/dashboard/...`) and `/register` open the app */
export const ANDROID_PACKAGE = "com.naseebak.naseebakApp";
export const IOS_APP_ID = "4S958MQTCR.com.naseebak.naseebakApp";

/** SHA-256 fingerprints of the Android signing certificates (Play App Signing key, upload key) for assetlinks.json */
export async function androidCertFingerprints(): Promise<string[]> {
  return (await getSetting(ANDROID_CERTS_KEY))
    .split(/[\s,]+/)
    .map((f) => f.trim().toUpperCase())
    .filter((f) => SHA256_FINGERPRINT.test(f));
}

/** Admin switch: buying credits shown in the app (default on) */
export async function appPaymentsEnabled(): Promise<boolean> {
  return (await getSetting(PAYMENTS_KEY)) !== "false";
}

/** Whether this member may buy in the app: the admin switch, and never for a test account (store review logins) */
export async function appPaymentsFor(phone: string | null | undefined): Promise<boolean> {
  return !isTestPhone(phone) && (await appPaymentsEnabled());
}

/** What Admin → Settings → Mobile app shows */
export async function getMobileAdminSettings() {
  return {
    ...(await getMobileConfig()),
    paymentsEnabled: await appPaymentsEnabled(),
    androidCertSha256: (await androidCertFingerprints()).join("\n"),
  };
}

/** Validates and saves what the admin sent; returns an error message or null */
export async function updateMobileConfig(input: unknown): Promise<string | null> {
  if (!input || typeof input !== "object") return "Invalid body";
  const updates: [string, string][] = [];
  const certs = (input as Record<string, unknown>).androidCertSha256;
  if (certs !== undefined) {
    if (typeof certs !== "string") return "androidCertSha256 must be text";
    const list = certs.split(/[\s,]+/).map((f) => f.trim().toUpperCase()).filter(Boolean);
    if (list.some((f) => !SHA256_FINGERPRINT.test(f))) return "Each fingerprint looks like AB:CD:…  (32 pairs, SHA-256)";
    updates.push([ANDROID_CERTS_KEY, list.join(",")]);
  }
  const payments = (input as Record<string, unknown>).paymentsEnabled;
  if (payments !== undefined) {
    if (typeof payments !== "boolean") return "paymentsEnabled must be true or false";
    updates.push([PAYMENTS_KEY, String(payments)]);
  }
  for (const p of MOBILE_PLATFORMS) {
    const cfg = (input as Record<string, unknown>)[p];
    if (cfg === undefined) continue;
    if (!cfg || typeof cfg !== "object") return `${p} must be an object`;
    for (const field of ["minVersion", "latestVersion", "storeUrl"] as const) {
      const v = (cfg as Record<string, unknown>)[field];
      if (v === undefined) continue;
      if (typeof v !== "string") return `${p}.${field} must be a string`;
      const value = v.trim();
      if (field !== "storeUrl" && value && !isVersion(value)) return `${p}.${field} must look like 1.2.3`;
      if (field === "storeUrl" && value && !/^https:\/\/\S+$/.test(value)) return `${p}.storeUrl must be an https link`;
      updates.push([key(p, field), value]);
    }
  }
  for (const [k, v] of updates) await setSetting(k, v);
  return null;
}
