import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function fileToBase64DataUrl(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");
  const mimeType = file.type || "image/jpeg";
  return `data:${mimeType};base64,${base64}`;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    let documentType: string | undefined;
    let frontImageData: string | undefined;
    let backImageData: string | undefined;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Handle FormData upload (from register page)
      const formData = await request.formData();
      documentType = formData.get("documentType") as string | undefined;

      const frontFile = formData.get("frontImage") as File | null;
      const backFile = formData.get("backImage") as File | null;

      if (frontFile && frontFile.size > 0) {
        frontImageData = await fileToBase64DataUrl(frontFile);
      }
      if (backFile && backFile.size > 0) {
        backImageData = await fileToBase64DataUrl(backFile);
      }
    } else {
      // Handle JSON upload (existing logic)
      const body = await request.json();
      documentType = body.documentType;
      frontImageData = body.frontImageData;
      backImageData = body.backImageData;
    }

    if (!documentType || !frontImageData) {
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

    // Upsert the identity doc
    const doc = await db.identityDoc.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        documentType,
        frontImageUrl: frontImageData, // In production, upload to encrypted cloud storage
        backImageUrl: backImageData || null,
        status: "PENDING",
      },
      update: {
        documentType,
        frontImageUrl: frontImageData,
        backImageUrl: backImageData || null,
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
