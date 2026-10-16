/** Client-safe feed types and helpers: no db or server imports. */

export type FeedTab = "new" | "waiting";
export type FeedKind = "mutual" | "legacy_suggestion" | "legacy_interest" | "legacy_sent";

export interface FeedCandidate {
  id: string;
  firstName: string;
  isVerified: boolean;
  age: number | null;
  city: string | null;
  area: string | null;
  nationality: string | null;
  education: string | null;
  fieldOfStudy: string | null;
  job: string | null;
  incomeRange: string | null;
  height: number | null;
  weight: number | null;
  skinColor: string | null;
  maritalStatus: string | null;
  childrenCount: number;
  religiosity: string | null;
  smokingStatus: string | null;
  aboutMe: string | null;
  hobbies: string | null;
  interests: string | null;
  lifestyle: string | null;
  beard: boolean | null;
  hijab: boolean | null;
  tribe: string | null;
  familyOriginArea: string | null;
  numberOfSiblings: number | null;
  housingType: string | null;
  cookingAbility: string | null;
  drivingLicense: boolean | null;
  willingToRelocate: string | null;
  familyValues: string | null;
}

export interface OpenFeedItem {
  kind: FeedKind;
  locked?: never;
  /** Suggestion id, or the Like id for legacy_interest */
  id: string;
  compatibilityScore: number;
  reason: string;
  createdAt: string;
  candidate: FeedCandidate;
}

/** Credit on interest at 0 credits: a MUTUAL suggestion shown blurred until a recharge (no profile fields). */
export interface LockedFeedItem {
  kind: "mutual";
  id: string;
  compatibilityScore: number;
  expiresAt: string;
  locked: true;
  /** The other side already said "مهتم" (owner exception; a "لا" is never distinguishable) */
  likedYou?: true;
}

export type FeedItem = OpenFeedItem | LockedFeedItem;

export function isLockedItem(item: FeedItem): item is LockedFeedItem {
  return item.locked === true;
}
