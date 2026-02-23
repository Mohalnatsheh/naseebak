/**
 * Bunny.net Storage + CDN utilities.
 * Follows the lazy-env pattern from src/lib/stripe.ts.
 */

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
