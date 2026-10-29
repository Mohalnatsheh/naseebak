/**
 * Bunny.net Storage + CDN utilities.
 * Follows the lazy-env pattern from src/lib/stripe.ts.
 *
 * Local runs without Bunny credentials (development, or a local `next start` with UPLOADS_LOCAL=true and a localhost
 * NEXT_PUBLIC_APP_URL) keep files in `.dev-uploads/` and serve them from `/api/dev/uploads/...`. A real server
 * without credentials still fails, as before.
 */
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { dirname, join, normalize, sep } from "path";

export const LOCAL_UPLOADS_PREFIX = "/api/dev/uploads/";
const LOCAL_UPLOADS_DIR = join(process.cwd(), ".dev-uploads");

function bunnyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.BUNNY_STORAGE_API_KEY && env.BUNNY_STORAGE_ZONE && env.BUNNY_STORAGE_ENDPOINT && env.BUNNY_CDN_URL);
}

/** Local file storage: only without Bunny credentials, and never on a server whose address isn't localhost */
export function localUploadsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (bunnyConfigured(env)) return false;
  if (env.NODE_ENV !== "production") return true;
  const url = env.NEXT_PUBLIC_APP_URL ?? "";
  return env.UPLOADS_LOCAL === "true" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
}

/** The file for a local upload path, or null when the path would leave the uploads folder */
export function localUploadFile(path: string): string | null {
  const file = normalize(join(LOCAL_UPLOADS_DIR, path));
  return file.startsWith(LOCAL_UPLOADS_DIR + sep) ? file : null;
}

export async function readLocalUpload(path: string): Promise<Buffer | null> {
  const file = localUploadFile(path);
  if (!file) return null;
  return readFile(file).catch(() => null);
}

function getConfig() {
  const apiKey = process.env.BUNNY_STORAGE_API_KEY;
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const endpoint = process.env.BUNNY_STORAGE_ENDPOINT;
  const cdnUrl = process.env.BUNNY_CDN_URL;
  if (!apiKey || !zone || !endpoint || !cdnUrl) {
    throw new Error("Missing Bunny.net env vars (BUNNY_STORAGE_API_KEY, BUNNY_STORAGE_ZONE, BUNNY_STORAGE_ENDPOINT, BUNNY_CDN_URL)");
  }
  return { apiKey, zone, endpoint, cdnUrl };
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Parse a base64 data URL into a Buffer + metadata. Returns null if malformed. */
export function base64ToBuffer(dataUrl: string): { buffer: Buffer; extension: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const extension = MIME_TO_EXT[mimeType] || "jpg";
  const buffer = Buffer.from(match[3], "base64");
  return { buffer, extension, mimeType };
}

/** Upload a buffer to Bunny Storage. Returns the CDN URL. */
export async function uploadToBunny(buffer: Buffer, path: string, mimeType?: string): Promise<string> {
  if (localUploadsAllowed()) {
    const file = localUploadFile(path);
    if (!file) throw new Error("Invalid upload path");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, buffer);
    return `${LOCAL_UPLOADS_PREFIX}${path}`;
  }
  const { apiKey, zone, endpoint, cdnUrl } = getConfig();
  const url = `https://${endpoint}/${zone}/${path}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: apiKey,
      "Content-Type": mimeType || "application/octet-stream",
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bunny upload failed (${res.status}): ${text}`);
  }

  return `${cdnUrl}/${path}`;
}

/** Delete a file from Bunny Storage. Fails silently (logs warning). */
export async function deleteFromBunny(path: string): Promise<void> {
  if (localUploadsAllowed()) {
    const file = localUploadFile(path);
    if (file) await unlink(file).catch(() => {});
    return;
  }
  try {
    const { apiKey, zone, endpoint } = getConfig();
    const url = `https://${endpoint}/${zone}/${path}`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: { AccessKey: apiKey },
    });

    if (!res.ok && res.status !== 404) {
      console.warn(`Bunny delete warning (${res.status}) for ${path}`);
    }
  } catch (err) {
    console.warn("Bunny delete error:", err);
  }
}

/** Extract the storage path from a CDN URL. Returns null for non-CDN URLs (e.g. base64). */
export function getBunnyPathFromUrl(url: string): string | null {
  if (url.startsWith(LOCAL_UPLOADS_PREFIX)) return url.slice(LOCAL_UPLOADS_PREFIX.length);
  const cdnUrl = process.env.BUNNY_CDN_URL;
  if (!cdnUrl || !url.startsWith(cdnUrl)) return null;
  return url.slice(cdnUrl.length + 1); // +1 for the trailing "/"
}

/** Convenience: parse base64 data URL → upload to Bunny. Appends correct extension. */
export async function uploadBase64ToBunny(dataUrl: string, pathWithoutExt: string): Promise<string> {
  const parsed = base64ToBuffer(dataUrl);
  if (!parsed) throw new Error("Invalid base64 data URL");
  const fullPath = `${pathWithoutExt}.${parsed.extension}`;
  return uploadToBunny(parsed.buffer, fullPath, parsed.mimeType);
}
