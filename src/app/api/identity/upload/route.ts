import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { base64ToBuffer, uploadToBunny, deleteFromBunny, getBunnyPathFromUrl } from "@/lib/bunny";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type ImageBuffer = { buffer: Buffer; extension: string; mimeType: string };

function fileToBufferInfo(file: File): Promise<ImageBuffer> {
  return file.arrayBuffer().then((ab) => {
    const mimeType = file.type || "image/jpeg";
    return {
      buffer: Buffer.from(ab),
      extension: MIME_TO_EXT[mimeType] || "jpg",
      mimeType,
    };
  });
}

// Identity verification is done via a selfie (no government ID).
// The selfie is stored in IdentityDoc.frontImageUrl with documentType "selfie".
export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    let selfie: ImageBuffer | null = null;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const selfieFile = formData.get("selfieImage") as File | null;

      if (selfieFile && selfieFile.size > 0) {
        if (!ALLOWED_MIME_TYPES.includes(selfieFile.type)) {
          return NextResponse.json(
            { error: "صيغة الصورة غير مدعومة. يرجى استخدام JPG أو PNG أو WebP" },
            { status: 400 }
          );
        }
        selfie = await fileToBufferInfo(selfieFile);
      }
    } else {
      // JSON upload — base64 data URL
      const body = await request.json();
      if (body.selfieImageData) {
        selfie = base64ToBuffer(body.selfieImageData);
        if (!selfie) {
          return NextResponse.json(
            { error: "صيغة الصورة الشخصية غير صالحة" },
            { status: 400 }
          );
        }
      }
    }

    if (!selfie) {
      return NextResponse.json(
        { error: "الصورة الشخصية (سيلفي) مطلوبة" },
        { status: 400 }
      );
    }

    // Check for existing pending/approved doc
    const existing = await db.identityDoc.findUnique({
      where: { userId: session.user.id },
    });

    if (existing?.status === "APPROVED") {
      return NextResponse.json(
        { error: "تم التحقق من هويتك مسبقاً" },
        { status: 400 }
      );
    }

    // Delete old Bunny files if re-uploading
    if (existing) {
      const oldFrontPath = getBunnyPathFromUrl(existing.frontImageUrl);
      if (oldFrontPath) await deleteFromBunny(oldFrontPath);
      if (existing.backImageUrl) {
        const oldBackPath = getBunnyPathFromUrl(existing.backImageUrl);
        if (oldBackPath) await deleteFromBunny(oldBackPath);
      }
    }

    // Upload to Bunny CDN (timestamped so the CDN never serves a stale cached selfie)
    let selfieCdnUrl: string;
    try {
      const selfiePath = `identity/${session.user.id}/selfie-${Date.now()}.${selfie.extension}`;
      selfieCdnUrl = await uploadToBunny(selfie.buffer, selfiePath, selfie.mimeType);
    } catch (err) {
      console.error("Bunny selfie upload error:", err);
      return NextResponse.json({ error: "فشل رفع الصورة. حاول مرة أخرى" }, { status: 500 });
    }

    const doc = await db.identityDoc.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        documentType: "selfie",
        frontImageUrl: selfieCdnUrl,
        backImageUrl: null,
        status: "PENDING",
      },
      update: {
        documentType: "selfie",
        frontImageUrl: selfieCdnUrl,
        backImageUrl: null,
        status: "PENDING",
        rejectionReason: null,
        reviewNotes: null,
        reviewedAt: null,
        reviewedById: null,
      },
    });

    return NextResponse.json({
      message: "تم رفع الصورة بنجاح. سيتم مراجعتها من قبل الإدارة.",
      doc: { id: doc.id, status: doc.status, documentType: doc.documentType },
    });
  } catch (error) {
    console.error("Identity upload error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
