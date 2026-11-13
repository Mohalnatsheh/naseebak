import type { CandidateDetailsData } from "@/components/suggestions/candidate-details";

/** What the full-profile panel reads from a match (the matches view's `Match` satisfies it) */
export interface MatchSummary {
  id: string;
  /** blocked: I blocked them · inactive: their account is off · finished: nothing left to do */
  closed: "blocked" | "inactive" | "finished" | "ended" | "engaged" | null;
  photosRevealed: boolean;
  createdAt: string;
  partner: CandidateDetailsData & {
    firstName: string;
    aboutMe: string | null;
  };
}
