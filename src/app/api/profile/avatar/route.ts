import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBase64ToBunny, deleteFromBunny, getBunnyPathFromUrl } from "@/lib/bunny";

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

    // Delete old avatar from Bunny if it exists
    const existingProfile = await db.profile.findUnique({
      where: { userId: session.user.id },
      select: { profileImageUrl: true },
    });
    if (existingProfile?.profileImageUrl) {
      const oldPath = getBunnyPathFromUrl(existingProfile.profileImageUrl);
      if (oldPath) {
        await deleteFromBunny(oldPath);
      }
    }

    // Upload to Bunny CDN
    const path = `avatars/${session.user.id}/avatar`;
    let cdnUrl: string;
    try {
      cdnUrl = await uploadBase64ToBunny(imageData, path);
    } catch (err) {
      console.error("Bunny avatar upload error:", err);
      return NextResponse.json(
        { error: "فشل رفع الصورة. حاول مرة أخرى" },
        { status: 500 }
      );
    }

    // Upsert profile with the CDN URL
    const profile = await db.profile.upsert({
      where: { userId: session.user.id },
      update: { profileImageUrl: cdnUrl },
      create: {
        userId: session.user.id,
        profileImageUrl: cdnUrl,
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

    // Delete from Bunny if it's a CDN URL
    const profile = await db.profile.findUnique({
      where: { userId: session.user.id },
      select: { profileImageUrl: true },
    });
    if (profile?.profileImageUrl) {
      const bunnyPath = getBunnyPathFromUrl(profile.profileImageUrl);
      if (bunnyPath) {
        await deleteFromBunny(bunnyPath);
      }
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
