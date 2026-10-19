/** Client-safe feed types and helpers: no db or server imports. */

/** new = nobody answered yet · interested = the other side already said «مهتم» · waiting = my «مهتم» */
export type FeedTab = "new" | "interested" | "waiting";
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
  /** Suggestion id, or the Like id for legacy_interest */
  id: string;
  compatibilityScore: number;
  reason: string;
  createdAt: string;
  /** Shared suggestions only: when the card closes if it isn't a match by then */
  expiresAt?: string;
  candidate: FeedCandidate;
  /** "interested" tab (and legacy interests): the other side already said «مهتم» */
  likedYou?: true;
  /** "waiting" tab: the other side said «لا» (owner decision 2026-10-19: shown, no refund) */
  declined?: true;
}

/** Every card is open: at 0 credits the profile stays visible and only "مهتم" waits for a recharge */
export type FeedItem = OpenFeedItem;
