import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteFromBunny, getBunnyPathFromUrl } from "@/lib/bunny";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;

    // Find the photo and verify ownership
    const photo = await db.photo.findUnique({
      where: { id },
    });

    if (!photo) {
      return NextResponse.json({ error: "الصورة غير موجودة" }, { status: 404 });
    }

    if (photo.userId !== session.user.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    // Delete from Bunny CDN (silently handles legacy base64 URLs)
    const bunnyPath = getBunnyPathFromUrl(photo.url);
    if (bunnyPath) {
      await deleteFromBunny(bunnyPath);
    }

    // Delete the photo
    await db.photo.delete({
      where: { id },
    });

    // If the deleted photo was primary, set the next photo as primary
    if (photo.isPrimary) {
      const nextPhoto = await db.photo.findFirst({
        where: { userId: session.user.id },
        orderBy: { order: "asc" },
      });

      if (nextPhoto) {
        await db.photo.update({
          where: { id: nextPhoto.id },
          data: { isPrimary: true },
        });
      }
    }

    // Re-order remaining photos
    const remainingPhotos = await db.photo.findMany({
      where: { userId: session.user.id },
      orderBy: { order: "asc" },
    });

    for (let i = 0; i < remainingPhotos.length; i++) {
      if (remainingPhotos[i].order !== i) {
        await db.photo.update({
          where: { id: remainingPhotos[i].id },
          data: { order: i },
        });
      }
    }

    return NextResponse.json({ message: "تم حذف الصورة بنجاح" });
  } catch (error) {
    console.error("Photo delete error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
