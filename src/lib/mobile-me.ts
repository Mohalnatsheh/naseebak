/** The member summary the app keeps after sign-in (`/api/mobile/auth/token`, `/api/mobile/me`). */
import { db } from "@/lib/db";
import { toCountry } from "@/lib/countries";
import { getCountrySettings, publicCountry } from "@/lib/countries/settings";
import { appPaymentsFor } from "@/lib/mobile-config";

export async function mobileMe(userId: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
      phone: true,
      country: true,
      matchCredits: true,
      status: true,
      isDeactivated: true,
      createdAt: true,
      profile: { select: { isComplete: true } },
      deletionRequest: { select: { scheduledAt: true, cancelledAt: true } },
    },
  });
  if (!u) return null;
  const country = toCountry(u.country);
  const deletion = u.deletionRequest && !u.deletionRequest.cancelledAt ? u.deletionRequest : null;
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    gender: u.gender,
    phone: u.phone,
    country: publicCountry(await getCountrySettings(country)),
    credits: u.matchCredits,
    status: u.status,
    deactivated: u.isDeactivated,
    profile: { exists: !!u.profile, complete: !!u.profile?.isComplete },
    /** A pending deletion request (the account is paused until then; reactivating cancels it), or null */
    deletion: deletion ? { scheduledFor: deletion.scheduledAt } : null,
    /** Buying credits shown in the app (Admin → Settings → Mobile app; never for test accounts) */
    appPayments: await appPaymentsFor(u.phone),
    createdAt: u.createdAt,
  };
}
