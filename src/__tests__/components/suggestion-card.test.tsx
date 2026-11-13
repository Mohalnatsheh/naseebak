import { describe, it, afterEach, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { SuggestionCard } from "@/components/suggestions/suggestion-card";
import type { FeedItem } from "@/lib/suggestions/feed-types";

const base = {
  kind: "mutual",
  id: "s1",
  compatibilityScore: 86,
  reason: "x",
  createdAt: "2026-11-13T00:00:00Z",
  activity: "نشطة اليوم",
  candidate: {
    id: "c1", firstName: "نسرين", isVerified: false, age: 27, city: "عمّان", area: null,
    nationality: null, education: "بكالوريوس", fieldOfStudy: null, job: "معلمة", incomeRange: null,
    height: 165, weight: null, skinColor: null, maritalStatus: "عزباء", childrenCount: 0, religiosity: "ملتزم",
    smokingStatus: "لا", sect: null, aboutMe: "أحب القراءة والهدوء", hobbies: null, interests: null,
    lifestyle: null, beard: null, hijab: true, niqab: false, tribe: "العبادي", familyOriginArea: null,
    numberOfSiblings: null, housingType: null, cookingAbility: null, drivingLicense: null,
    willingToRelocate: null, familyValues: null,
  },
};
const item = base as unknown as FeedItem;
const noAbout = { ...base, candidate: { ...base.candidate, aboutMe: null } } as unknown as FeedItem;

function setup(it: FeedItem = item) {
  const onOpen = vi.fn();
  const inner = vi.fn();
  render(
    <SuggestionCard
      item={it}
      partnerGender="FEMALE"
      country="JO"
      status={<div>STATUS</div>}
      onOpen={onOpen}
      actions={<button onClick={inner}>مهتم</button>}
    />
  );
  return { onOpen, inner };
}

describe("SuggestionCard", () => {
  afterEach(cleanup);

  it("shows the short card", () => {
    setup();
    expect(screen.getByText("نسرين، 27")).toBeTruthy();
    expect(screen.getByText("عمّان")).toBeTruthy();
    expect(screen.getByText("نشطة اليوم")).toBeTruthy();
    expect(screen.getByText("توافق 86%")).toBeTruthy();
    for (const l of ["العمل", "التعليم", "الالتزام", "الحجاب", "الطول", "الحالة الاجتماعية", "التدخين"]) {
      expect(screen.getByText(l)).toBeTruthy();
    }
    expect(screen.getByText("عنها")).toBeTruthy();
    expect(screen.getByText("أحب القراءة والهدوء")).toBeTruthy();
    expect(screen.getByRole("button", { name: "الملف كاملاً" })).toBeTruthy();
    expect(screen.queryByText("عرض جميع التفاصيل")).toBeNull();
    expect(screen.getByText("STATUS")).toBeTruthy();
  });

  it("opens from the body or the button once; actions never open it", () => {
    const { onOpen, inner } = setup();
    fireEvent.click(screen.getByText("نسرين، 27"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "الملف كاملاً" }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "مهتم" }));
    expect(inner).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("opens with Enter on the focused card", () => {
    const { onOpen } = setup();
    fireEvent.keyDown(screen.getByRole("button", { name: "الملف كاملاً: نسرين" }), { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("has no «عنها» heading without aboutMe", () => {
    setup(noAbout);
    expect(screen.queryByText("عنها")).toBeNull();
  });
});
