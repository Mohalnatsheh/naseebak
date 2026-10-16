/**
 * Account deletions whose 30-day grace period is over: remove Bunny files, then the user's data.
 * Shared by GET /api/cron/process-deletions (legacy ?token= route) and the daily scheduler.
 */
import { db } from "@/lib/db";
import { deleteFromBunny, getBunnyPathFromUrl } from "@/lib/bunny";

export async function processAccountDeletions(): Promise<number> {
  // Find all requests that are past the scheduled date and not cancelled
  const expiredRequests = await db.accountDeletionRequest.findMany({
    where: {
      scheduledAt: { lte: new Date() },
      cancelledAt: null,
    },
    select: { id: true, userId: true },
  });

  let deletedCount = 0;

  for (const req of expiredRequests) {
    try {
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

      // Delete all user data (cascade will handle most relations)
      // But we need to clean up manual relations first
      await db.$transaction([
        db.report.deleteMany({ where: { OR: [{ reporterId: req.userId }, { reportedId: req.userId }] } }),
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
