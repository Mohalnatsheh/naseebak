/**
 * Shrink a photo in the browser before upload: phone photos are often over the 5MB limit.
 * Returns a JPEG data URL (longest side ≤ maxSide) or throws with an Arabic message.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("الملف المختار ليس صورة");

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("تعذّر قراءة الصورة. جرّب صورة بصيغة JPG أو PNG"));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذّر تجهيز الصورة");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
