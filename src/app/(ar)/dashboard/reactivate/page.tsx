import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ReactivatePanel } from "./reactivate-panel";

export const metadata: Metadata = {
  title: "إعادة تفعيل الحساب | نصيبك",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function ReactivatePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      firstName: true,
      gender: true,
      isDeactivated: true,
      deletionRequest: { select: { scheduledAt: true, cancelledAt: true } },
    },
  });
  if (!user) redirect("/login");
  // Active accounts have nothing to do here
  if (!user.isDeactivated) redirect("/dashboard");

  const pendingDeletion =
    user.deletionRequest && !user.deletionRequest.cancelledAt ? user.deletionRequest : null;

  return (
    <ReactivatePanel
      firstName={user.firstName}
      isFemale={user.gender === "FEMALE"}
      deletionScheduledAt={pendingDeletion ? pendingDeletion.scheduledAt.toISOString() : null}
    />
  );
}
