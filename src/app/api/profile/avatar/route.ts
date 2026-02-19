import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
];

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await request.json();
    const { imageData } = body;

    if (!imageData || typeof imageData !== "string") {
      return NextResponse.json(
        { error: "يرجى تقديم صورة صالحة" },
        { status: 400 }
      );
    }

    // Validate format
    const isValidFormat = ALLOWED_PREFIXES.some((prefix) =>
      imageData.startsWith(prefix)
    );
    if (!isValidFormat) {
      return NextResponse.json(
        { error: "صيغة الصورة غير مدعومة. يرجى استخدام JPG أو PNG أو WebP" },
        { status: 400 }
      );
    }

    // Validate size (base64 is ~33% larger than binary)
    const base64Part = imageData.split(",")[1];
    if (!base64Part) {
      return NextResponse.json(
        { error: "بيانات الصورة غير صالحة" },
        { status: 400 }
      );
    }
    const sizeInBytes = Math.ceil((base64Part.length * 3) / 4);
    if (sizeInBytes > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "حجم الصورة يجب أن يكون أقل من 5 ميجابايت" },
        { status: 400 }
      );
    }

    // Upsert profile with the image
    const profile = await db.profile.upsert({
      where: { userId: session.user.id },
      update: { profileImageUrl: imageData },
      create: {
        userId: session.user.id,
        profileImageUrl: imageData,
      },
      select: { profileImageUrl: true },
    });

    return NextResponse.json({ profileImageUrl: profile.profileImageUrl });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في الخادم" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    await db.profile.updateMany({
      where: { userId: session.user.id },
      data: { profileImageUrl: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Avatar delete error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في الخادم" },
      { status: 500 }
    );
  }
}
