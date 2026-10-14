/**
 * Client-side image compression for uploads.
 * Phone camera photos are often 3-12MB; resizing to a max dimension and
 * re-encoding as JPEG keeps the upload small (~150-400KB) and also converts
 * formats the server does not accept (e.g. HEIC on Safari) to JPEG.
 */

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to decode image"));
    img.src = src;
  });
}

/** Resize + re-encode an image file. Returns a `data:image/jpeg;base64,...` URL. */
export async function compressImageToDataUrl(
  file: File,
  maxDimension = 1280,
  quality = 0.85
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    // Browsers apply EXIF orientation when drawing an <img> to canvas
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", quality);
  } catch (err) {
    // Fall back to the original file if it is already an accepted format
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return readAsDataUrl(file);
    }
    throw err;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
