import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { base64ToBuffer, uploadToBunny, deleteFromBunny, getBunnyPathFromUrl } from "@/lib/bunny";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function fileToBufferInfo(file: File): Promise<{ buffer: Buffer; extension: string; mimeType: string }> {
  return file.arrayBuffer().then((ab) => {
    const mimeType = file.type || "image/jpeg";
    return {
      buffer: Buffer.from(ab),
      extension: MIME_TO_EXT[mimeType] || "jpg",
      mimeType,
    };
  });
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    let documentType: string | undefined;
    let frontBuffer: { buffer: Buffer; extension: string; mimeType: string } | null = null;
    let backBuffer: { buffer: Buffer; extension: string; mimeType: string } | null = null;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Handle FormData upload (from register page)
      const formData = await request.formData();
      documentType = formData.get("documentType") as string | undefined;

      const frontFile = formData.get("frontImage") as File | null;
      const backFile = formData.get("backImage") as File | null;

      if (frontFile && frontFile.size > 0) {
        if (!ALLOWED_MIME_TYPES.includes(frontFile.type)) {
          return NextResponse.json(
            { error: "صيغة الصورة غير مدعومة. يرجى استخدام JPG أو PNG أو WebP" },
            { status: 400 }
          );
        }
        frontBuffer = await fileToBufferInfo(frontFile);
      }
      if (backFile && backFile.size > 0) {
        if (!ALLOWED_MIME_TYPES.includes(backFile.type)) {
          return NextResponse.json(
            { error: "صيغة الصورة غير مدعومة. يرجى استخدام JPG أو PNG أو WebP" },
            { status: 400 }
          );
        }
        backBuffer = await fileToBufferInfo(backFile);
      }
    } else {
      // Handle JSON upload (existing logic — base64 data URLs)
      const body = await request.json();
      documentType = body.documentType;

      if (body.frontImageData) {
        frontBuffer = base64ToBuffer(body.frontImageData);
        if (!frontBuffer) {
          return NextResponse.json(
            { error: "صيغة صورة الوجه الأمامي غير صالحة" },
            { status: 400 }
          );
        }
      }
      if (body.backImageData) {
        backBuffer = base64ToBuffer(body.backImageData);
        if (!backBuffer) {
          return NextResponse.json(
            { error: "صيغة صورة الوجه الخلفي غير صالحة" },
            { status: 400 }
          );
        }
      }
    }

    if (!documentType || !frontBuffer) {
      return NextResponse.json(
        { error: "نوع الوثيقة وصورة الوجه الأمامي مطلوبة" },
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

    // Upload to Bunny CDN
    let frontCdnUrl: string;
    let backCdnUrl: string | null = null;

    try {
      const frontPath = `identity/${session.user.id}/front.${frontBuffer.extension}`;
      frontCdnUrl = await uploadToBunny(frontBuffer.buffer, frontPath, frontBuffer.mimeType);

      if (backBuffer) {
        const backPath = `identity/${session.user.id}/back.${backBuffer.extension}`;
        backCdnUrl = await uploadToBunny(backBuffer.buffer, backPath, backBuffer.mimeType);
      }
    } catch (err) {
      console.error("Bunny identity upload error:", err);
      return NextResponse.json({ error: "فشل رفع الوثيقة. حاول مرة أخرى" }, { status: 500 });
    }

    // Upsert the identity doc
    const doc = await db.identityDoc.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        documentType,
        frontImageUrl: frontCdnUrl,
        backImageUrl: backCdnUrl,
        status: "PENDING",
      },
      update: {
        documentType,
        frontImageUrl: frontCdnUrl,
        backImageUrl: backCdnUrl,
        status: "PENDING",
        rejectionReason: null,
        reviewNotes: null,
        reviewedAt: null,
        reviewedById: null,
      },
    });

    return NextResponse.json({
      message: "تم رفع الوثيقة بنجاح. سيتم مراجعتها من قبل الإدارة.",
      doc: { id: doc.id, status: doc.status, documentType: doc.documentType },
    });
  } catch (error) {
    console.error("Identity upload error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
