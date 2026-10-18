/**
 * Account deletions whose 30-day grace period is over: remove Bunny files, then the user's data.
 * Run by the daily scheduler (src/lib/cron/daily.ts).
 */
import { db } from "@/lib/db";
import { deleteFromBunny, getBunnyPathFromUrl } from "@/lib/bunny";
import { closeActivityForLeaving } from "@/lib/matches/leave";
import { snapshotReportEvidence } from "@/lib/reports";

export async function processAccountDeletions(): Promise<number> {
  // Find all requests that are past the scheduled date and not cancelled
  const expiredRequests = await db.accountDeletionRequest.findMany({
    where: {
      scheduledAt: { lte: new Date() },
      cancelledAt: null,
      // Only accounts still paused: a resumed account (deletion cancelled or not) is never deleted
      user: { isDeactivated: true },
    },
    select: { id: true, userId: true },
  });

  let deletedCount = 0;

  for (const req of expiredRequests) {
    try {
      // Re-check right before deleting: the member may have resumed since the list was read
      const fresh = await db.accountDeletionRequest.findUnique({
        where: { id: req.id },
        select: { cancelledAt: true, scheduledAt: true, user: { select: { isDeactivated: true } } },
      });
      if (!fresh || fresh.cancelledAt || fresh.scheduledAt > new Date() || !fresh.user?.isDeactivated) continue;

      // Clean up Bunny CDN files before DB deletion
      try {
        const [photos, identityDoc, profile] = await Promise.all([
          db.photo.findMany({
            where: { userId: req.userId },
            select: { url: true },
          }),
          db.identityDoc.findUnique({
            where: { userId: req.userId },
            select: { frontImageUrl: true, backImageUrl: true },
          }),
          db.profile.findUnique({
            where: { userId: req.userId },
            select: { profileImageUrl: true },
          }),
        ]);

        const deletions: Promise<void>[] = [];

        // Delete photos from Bunny
        for (const photo of photos) {
          const path = getBunnyPathFromUrl(photo.url);
          if (path) deletions.push(deleteFromBunny(path));
        }

        // Delete identity docs from Bunny
        if (identityDoc?.frontImageUrl) {
          const path = getBunnyPathFromUrl(identityDoc.frontImageUrl);
          if (path) deletions.push(deleteFromBunny(path));
        }
        if (identityDoc?.backImageUrl) {
          const path = getBunnyPathFromUrl(identityDoc.backImageUrl);
          if (path) deletions.push(deleteFromBunny(path));
        }

        // Delete avatar from Bunny
        if (profile?.profileImageUrl) {
          const path = getBunnyPathFromUrl(profile.profileImageUrl);
          if (path) deletions.push(deleteFromBunny(path));
        }

        await Promise.all(deletions);
      } catch (bunnyErr) {
        // Bunny cleanup failures must not block DB deletion
        console.warn(`Bunny cleanup warning for user ${req.userId}:`, bunnyErr);
      }

      // Partners are told before the matches disappear with the account
      await closeActivityForLeaving(req.userId, "deleted").catch((e) => console.warn(`Leave notice warning for ${req.userId}:`, e));

      // Reports are kept: save both people and their chat on each report first (the chat goes with
      // the match), then the report's link to this account is set to null by the foreign key.
      // A failed snapshot stops this deletion (retried tomorrow) rather than lose the evidence.
      await snapshotReportEvidence(req.userId);

      // Delete all user data (cascade will handle most relations)
      // But we need to clean up manual relations first
      await db.$transaction([
        db.block.deleteMany({ where: { OR: [{ blockerId: req.userId }, { blockedId: req.userId }] } }),
        db.notification.deleteMany({ where: { userId: req.userId } }),
        db.like.deleteMany({ where: { OR: [{ fromUserId: req.userId }, { toUserId: req.userId }] } }),
        db.suggestion.deleteMany({ where: { OR: [{ recipientId: req.userId }, { candidateId: req.userId }] } }),
        db.accountDeletionRequest.delete({ where: { id: req.id } }),
        db.user.delete({ where: { id: req.userId } }),
      ]);
      deletedCount++;
    } catch (err) {
      console.error(`Failed to delete user ${req.userId}:`, err);
    }
  }

  return deletedCount;
}
