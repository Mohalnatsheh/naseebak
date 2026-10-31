import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertInputSchema } from "@/lib/alerts";
import { uploadBase64ToBunny } from "@/lib/bunny";
import { getAdminCountry } from "@/lib/admin/country-filter";
import { countryConfig } from "@/lib/countries";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Alerts of the admin's selected country (and those for every country), newest first, with how many closed each */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const country = await getAdminCountry(request);
    const alerts = await db.alert.findMany({
      where: country === "ALL" ? {} : { OR: [{ country }, { country: null }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        _count: { select: { dismissals: true } },
      },
    });
    return NextResponse.json({ alerts });
  } catch (error) {
    console.error("Admin alerts error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const parsed = alertInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid alert" }, { status: 400 });
    }
    const input = parsed.data;
    const country = await getAdminCountry(request);

    if (input.audience === "USER") {
      const user = await db.user.findUnique({ where: { id: input.userId! }, select: { country: true } });
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
      if (country !== "ALL" && user.country !== country) {
        return NextResponse.json(
          { error: `This member is in ${countryConfig(user.country).nameEn}: switch the admin country to alert them` },
          { status: 409 },
        );
      }
    }

    let imageUrl: string | null = null;
    if (input.image) {
      const base64 = input.image.split(",")[1] ?? "";
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(input.image)) {
        return NextResponse.json({ error: "The image must be JPEG, PNG or WebP" }, { status: 400 });
      }
      if (Math.ceil((base64.length * 3) / 4) > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "The image must be 2 MB or smaller" }, { status: 400 });
      }
      imageUrl = await uploadBase64ToBunny(input.image, `alerts/${randomUUID()}`);
    }

    const alert = await db.alert.create({
      data: {
        title: input.title,
        body: input.body,
        imageUrl,
        buttonLabel: input.buttonLabel ?? null,
        buttonUrl: input.buttonUrl ?? null,
        audience: input.audience,
        userId: input.audience === "USER" ? input.userId! : null,
        channel: input.channel,
        country: country === "ALL" ? null : country,
        startsAt: input.startsAt ?? new Date(),
        endsAt: input.endsAt ?? null,
      },
    });
    return NextResponse.json({ alert }, { status: 201 });
  } catch (error) {
    console.error("Admin create alert error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
