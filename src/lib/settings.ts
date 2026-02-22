import { db } from "@/lib/db";

const DEFAULTS: Record<string, string> = {
  registration_open: "true",
};

const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds

export async function getSetting(key: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }

  try {
    const row = await db.systemSetting.findUnique({ where: { key } });
    const value = row?.value ?? DEFAULTS[key] ?? "";
    cache.set(key, { value, expiresAt: now + CACHE_TTL });
    return value;
  } catch {
    return DEFAULTS[key] ?? "";
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  cache.delete(key);
}

export async function isRegistrationOpen(): Promise<boolean> {
  const value = await getSetting("registration_open");
  return value === "true";
}
