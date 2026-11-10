import { BRAND_HEX } from "@/lib/brand-colors";
/**
 * Photos in the website chat, before upload (browser only, no db imports): scaled to a JPEG when the browser can
 * decode them, passed to the server as they are when it can't (the server decodes HEIC and sniffs the type).
 */

/** Photos: the long side sent at most (the server stores 1600 px WebP anyway) */
const PHOTO_MAX_SIDE = 2048;
/** Already small enough to send untouched (when the format is one the server reads) */
const PHOTO_PASS_BYTES = 1.5 * 1024 * 1024;
const PASS_TYPES = ["image/jpeg", "image/png", "image/webp"];
const HEIC_TYPES = ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];

/** A HEIC/HEIF photo by its type or, when the browser gave none it knows, its `.heic`/`.heif` name */
export function isHeicFile(file: Pick<File, "type" | "name">): boolean {
  return HEIC_TYPES.includes(file.type.toLowerCase()) || /\.hei[cf]$/i.test(file.name ?? "");
}

export interface PreparedPhoto {
  blob: Blob;
  width: number | null;
  height: number | null;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

/**
 * Before upload: HEIC/HEIF and large photos become a JPEG of at most 2048 px on the long side, when the
 * browser can decode them (iPhone Safari decodes HEIC). A small JPEG/PNG/WebP goes as it is. A HEIC/HEIF
 * the browser can't decode (Chrome, Edge) goes as it is too: the server decodes it, and so does a file with no
 * type. Returns null when the photo can't be used at all.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto | null> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    // Not decodable here: let the server judge a type it reads (HEIC/HEIF included), refuse the rest now. A file
    // with no type at all goes too: the server reads its first bytes (an iPhone photo from a cloud gallery)
    if (PASS_TYPES.includes(file.type) || file.type === "") {
      if (!isHeicFile(file)) return { blob: file, width: null, height: null };
    } else if (!isHeicFile(file)) return null;
    // Typed, so the upload is named .heic even when the browser gave the file no type
    const blob = HEIC_TYPES.includes(file.type.toLowerCase()) ? file : new Blob([file], { type: "image/heic" });
    return { blob, width: null, height: null };
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  if (PASS_TYPES.includes(file.type) && file.size <= PHOTO_PASS_BYTES && Math.max(w, h) <= PHOTO_MAX_SIDE) {
    return { blob: file, width: w, height: h };
  }
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return PASS_TYPES.includes(file.type) ? { blob: file, width: w, height: h } : null;
  // JPEG has no transparency: a white page under a PNG's clear parts
  ctx.fillStyle = BRAND_HEX.white;
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) return PASS_TYPES.includes(file.type) ? { blob: file, width: w, height: h } : null;
  return { blob, width: cw, height: ch };
}
