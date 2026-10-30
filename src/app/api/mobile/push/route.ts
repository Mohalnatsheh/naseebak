import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeMobileSession } from "@/lib/mobile-auth";

const registerSchema = z.object({
  /** Firebase Installation ID (firebase_messaging `onRegistered`) */
  fid: z.string().min(10).max(512),
  platform: z.enum(["android", "ios"]),
});
const removeSchema = z.object({ fid: z.string().min(10).max(512) });

/**
 * The app's FCM device (FID, src/lib/fcm.ts), tied to this app sign-in (Bearer only): pushes stop when it is revoked.
 * Called after sign-in and on every `onRegistered`. An FID already stored moves to this sign-in.
 */
export async function POST(request: Request) {
  try {
    const result = await requireUser({ allowDeactivated: true });
    if ("error" in result) return result.error;
    const session = await activeMobileSession(request.headers.get("authorization"));
    if (!session || session.userId !== result.session.user.id) {
      return NextResponse.json({ error: "للتطبيق فقط", code: "APP_ONLY" }, { status: 403 });
    }
    const parsed = registerSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة", code: "INVALID" }, { status: 400 });

    const { fid, platform } = parsed.data;
    const data = { userId: session.userId, mobileSessionId: session.id, platform };
    await db.pushDevice.upsert({ where: { fid }, create: { fid, ...data }, update: data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mobile push] register failed:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

/** Sign-out on the device (called before `/api/mobile/auth/logout`): this FID gets no more pushes. Always 200. */
export async function DELETE(request: Request) {
  try {
    const result = await requireUser({ allowDeactivated: true });
    if ("error" in result) return result.error;
    const parsed = removeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة", code: "INVALID" }, { status: 400 });
    await db.pushDevice.deleteMany({ where: { fid: parsed.data.fid, userId: result.session.user.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mobile push] remove failed:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
