import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBase64ToBunny } from "@/lib/bunny";
import { randomUUID } from "crypto";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
];

export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const photos = await db.photo.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        url: true,
        isPrimary: true,
        order: true,
        createdAt: true,
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ photos });
  } catch (error) {
    console.error("Photos get error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json();
    const { photoData, isPrimary } = body;

    if (!photoData || typeof photoData !== "string") {
      return NextResponse.json({ error: "بيانات الصورة مطلوبة" }, { status: 400 });
    }

    // Validate format
    const isValidFormat = ALLOWED_PREFIXES.some((prefix) =>
      photoData.startsWith(prefix)
    );
    if (!isValidFormat) {
      return NextResponse.json(
        { error: "صيغة الصورة غير مدعومة. يرجى استخدام JPG أو PNG أو WebP" },
        { status: 400 }
      );
    }

    // Validate size
    const base64Part = photoData.split(",")[1];
    if (!base64Part) {
      return NextResponse.json({ error: "بيانات الصورة غير صالحة" }, { status: 400 });
    }
    const sizeInBytes = Math.ceil((base64Part.length * 3) / 4);
    if (sizeInBytes > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "حجم الصورة يجب أن يكون أقل من 5 ميجابايت" },
        { status: 400 }
      );
    }

    const count = await db.photo.count({ where: { userId: session.user.id } });
    if (count >= 5) {
      return NextResponse.json({ error: "الحد الأقصى 5 صور" }, { status: 400 });
    }

    // Upload to Bunny CDN
    const uuid = randomUUID();
    const path = `photos/${session.user.id}/${uuid}`;
    let cdnUrl: string;
    try {
      cdnUrl = await uploadBase64ToBunny(photoData, path);
    } catch (err) {
      console.error("Bunny photo upload error:", err);
      return NextResponse.json({ error: "فشل رفع الصورة. حاول مرة أخرى" }, { status: 500 });
    }

    // If this photo is set as primary, unset other primary photos
    if (isPrimary) {
      await db.photo.updateMany({
        where: { userId: session.user.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const photo = await db.photo.create({
      data: {
        userId: session.user.id,
        url: cdnUrl,
        isPrimary: isPrimary || count === 0,
        order: count,
      },
    });

    return NextResponse.json({ message: "تم رفع الصورة", photo });
  } catch (error) {
    console.error("Photo upload error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
