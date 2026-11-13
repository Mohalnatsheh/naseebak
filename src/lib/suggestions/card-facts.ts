/** The facts on a suggestion card (db-free: client components import it). Same wording as `CandidateDetails`. */
import type { CountryCode } from "@/lib/countries";
import { describeOption, tribeLabel } from "@/lib/profile-options";
import { veilLabel } from "@/lib/profile-veil";
import type { FeedCandidate } from "@/lib/suggestions/feed-types";

export interface CardFact {
  key: string;
  label: string;
  value: string;
}

/**
 * Up to eight facts in a fixed order: job, education, religiosity, veil (a woman) or beard (a man), height,
 * marital status, smoking, then «المذهب» (Lebanon, when shown) or the country's tribe word. Empty ones are left out.
 */
export function cardFacts(c: FeedCandidate, partnerGender: "MALE" | "FEMALE", country: CountryCode): CardFact[] {
  const facts: CardFact[] = [];
  const add = (key: string, label: string, value: string | null | undefined) => {
    if (value) facts.push({ key, label, value });
  };

  add("job", "العمل", c.job && describeOption("job", c.job, partnerGender));
  add("education", "التعليم", c.education);
  add("religiosity", "الالتزام", c.religiosity && describeOption("religiosity", c.religiosity, partnerGender));
  if (partnerGender === "FEMALE") {
    if (c.hijab !== null && c.hijab !== undefined) add("veil", "الحجاب", veilLabel(c.hijab, c.niqab));
  } else if (c.beard !== null && c.beard !== undefined) {
    add("beard", "اللحية", c.beard ? "نعم" : "لا");
  }
  add("height", "الطول", c.height ? `${c.height} سم` : null);
  add("maritalStatus", "الحالة الاجتماعية", c.maritalStatus && describeOption("maritalStatus", c.maritalStatus, partnerGender));
  add("smoking", "التدخين", c.smokingStatus && describeOption("smokingStatus", c.smokingStatus, partnerGender));
  if (country === "LB" && c.sect) {
    add("sect", "المذهب", describeOption("sect", c.sect, partnerGender));
  } else {
    add("tribe", tribeLabel(country), c.tribe);
  }
  return facts;
}
