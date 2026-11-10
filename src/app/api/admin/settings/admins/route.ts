import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";

export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const admins = await db.user.findMany({
      where: { role: "ADMIN" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // `me`: the page hides «Remove» on your own row (the DELETE refuses it anyway)
    return NextResponse.json({ admins, me: result.session.user.id });
  } catch (error) {
    console.error("Admin list error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** Add Admin (QA ADM-08): every field checked, the email lowercased; a malformed body is a 400, never a 500 */
const addAdminSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(50),
  lastName: z.string().trim().min(1, "Last name is required").max(50),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function POST(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const body = await request.json().catch(() => null);
    const parsed = addAdminSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((issue) => issue.message).join(" · ") },
        { status: 400 },
      );
    }
    const { firstName, lastName, email, password } = parsed.data;

    const existing = await db.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await db.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        gender: "MALE",
        role: "ADMIN",
        status: "VERIFIED",
        isVerified: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ message: "Admin created", admin });
  } catch (error) {
    console.error("Admin create error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
