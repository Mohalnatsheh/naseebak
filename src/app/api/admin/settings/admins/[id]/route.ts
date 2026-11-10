import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { revokeWebSessions } from "@/lib/session-revocation";

/**
 * Remove an admin (QA ADM-08, 2026-11-11): DELETE /api/admin/settings/admins/<id>.
 *
 * The account is demoted, never deleted (its admin notes, sends and decisions keep their author): role → USER, the
 * admin password cleared, every web session revoked (requireAdmin re-reads the role, so access ends at once).
 * An admin-only account (no phone) can't be used as a member, so it is also suspended. A member who was made admin
 * keeps their member account.
 *
 * Refused: yourself (400 SELF), someone who isn't an admin (404), and the last admin (409 LAST_ADMIN): one who can
 * still sign in (a password, not suspended, not paused). The count and the demotion run in one SERIALIZABLE
 * transaction, so two admins removing each other at once can't leave none: one of them fails (409 RETRY).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;

    if (id === result.session.user.id) {
      return NextResponse.json({ error: "You can't remove yourself", code: "SELF" }, { status: 400 });
    }

    const outcome = await db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, select: { id: true, role: true, phone: true } });
      if (!target || target.role !== "ADMIN") return "NOT_FOUND" as const;
      // Others who can still sign in as admin, besides the one being removed
      const others = await tx.user.count({
        where: { role: "ADMIN", id: { not: id }, status: { not: "SUSPENDED" }, isDeactivated: false, passwordHash: { not: null } },
      });
      if (others < 1) return "LAST_ADMIN" as const;
      await tx.user.update({
        where: { id },
        data: { role: "USER", passwordHash: null, ...(target.phone ? {} : { status: "SUSPENDED" as const }) },
      });
      return "REMOVED" as const;
    }, { isolationLevel: "Serializable" });

    if (outcome === "NOT_FOUND") return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    if (outcome === "LAST_ADMIN") {
      return NextResponse.json({ error: "The last admin can't be removed", code: "LAST_ADMIN" }, { status: 409 });
    }
    await revokeWebSessions(id);
    console.log(`[admin-remove] ${result.session.user.id} removed admin ${id}`);
    return NextResponse.json({ message: "Admin removed", id });
  } catch (error) {
    // Two removals at once: Postgres refused one of them (serialization failure)
    if ((error as { code?: string })?.code === "P2034") {
      return NextResponse.json({ error: "Another admin change happened at the same time. Try again.", code: "RETRY" }, { status: 409 });
    }
    console.error("Admin remove error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
