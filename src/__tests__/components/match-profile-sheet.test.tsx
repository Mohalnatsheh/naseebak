import { describe, it, afterEach, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({ profile: { gender: "MALE" }, country: "JO" }),
}));

import { MatchProfileSheet } from "@/components/matches/match-profile-sheet";
import type { MatchSummary } from "@/components/matches/match-types";

const match: MatchSummary = {
  id: "m1",
  closed: null,
  photosRevealed: true,
  createdAt: "2026-11-10T09:00:00Z",
  partner: {
    firstName: "سارة", age: 27, city: "عمّان", area: "الجبيهة",
    nationality: "أردنية", education: "بكالوريوس", fieldOfStudy: "تمريض", job: "معلمة", incomeRange: "متوسط",
    height: 165, weight: 60, skinColor: null, maritalStatus: "عزباء", childrenCount: 0, religiosity: "ملتزم",
    religion: "مسلم", sect: null, smokingStatus: "لا", aboutMe: "أحب القراءة والهدوء", hobbies: "القراءة،السفر",
    interests: "الطبخ", lifestyle: "هادئ", beard: null, hijab: true, niqab: false, tribe: "العبادي",
    familyOriginArea: "السلط", numberOfSiblings: 3, housingType: "مستقل", cookingAbility: "ممتاز",
    drivingLicense: true, willingToRelocate: "yes", familyValues: "الاحترام",
  },
};
const photos = [{ id: "p1", url: "https://cdn.test/a.webp" }, { id: "p2", url: "https://cdn.test/b.webp" }];

function setup(over: Partial<Parameters<typeof MatchProfileSheet>[0]> = {}) {
  const onLoadPhotos = vi.fn();
  render(
    <MatchProfileSheet match={match} photos={photos} photosFailed={false} onLoadPhotos={onLoadPhotos} onClose={() => {}} {...over} />,
  );
  return { onLoadPhotos, dialog: screen.getByRole("dialog") };
}

describe("MatchProfileSheet", () => {
  afterEach(async () => { cleanup(); await new Promise((r) => setTimeout(r, 20)); });

  it("shows the header and every detail", () => {
    const { dialog } = setup();
    expect(within(dialog).getByText("سارة، 27")).toBeTruthy();
    expect(within(dialog).getByText("عمّان · معلمة")).toBeTruthy();
    expect(within(dialog).getByText(/توافق بتاريخ \d/)).toBeTruthy();
    expect(within(dialog).getByText("عنها")).toBeTruthy();
    expect(within(dialog).getByText("أحب القراءة والهدوء")).toBeTruthy();
    for (const label of [
      "المعلومات الشخصية", "التعليم والعمل", "الدين ونمط الحياة", "العائلة", "الهوايات والاهتمامات",
      "المدينة", "الجنسية", "المستوى التعليمي", "الوظيفة", "الديانة", "مستوى التدين", "عدد الإخوة", "القيم العائلية",
    ]) {
      expect(within(dialog).getByText(label), label).toBeTruthy();
    }
  });

  it("shows the photos of an open revealed match and opens the lightbox on a tap", () => {
    const { dialog, onLoadPhotos } = setup();
    expect(onLoadPhotos).not.toHaveBeenCalled();
    const buttons = within(dialog).getAllByRole("button", { name: /عرض الصورة/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(document.querySelectorAll('img[src="https://cdn.test/b.webp"]').length).toBeGreaterThan(1);
  });

  it("asks for the photos once when none are loaded", () => {
    const { onLoadPhotos } = setup({ photos: undefined });
    expect(onLoadPhotos).toHaveBeenCalledTimes(1);
  });

  it("shows an error line with a retry, never «no photos»", () => {
    const { dialog, onLoadPhotos } = setup({ photos: undefined, photosFailed: true });
    expect(within(dialog).getByText("تعذّر تحميل الصور.")).toBeTruthy();
    expect(onLoadPhotos).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "إعادة المحاولة" }));
    expect(onLoadPhotos).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByText(/لا توجد صور/)).toBeNull();
  });

  it("never renders photos nor asks for them on a closed or unrevealed match", () => {
    for (const m of [{ ...match, closed: "ended" as const }, { ...match, photosRevealed: false }]) {
      const onLoadPhotos = vi.fn();
      const { unmount } = render(
        <MatchProfileSheet match={m} photos={undefined} photosFailed={false} onLoadPhotos={onLoadPhotos} onClose={() => {}} />,
      );
      expect(onLoadPhotos).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /عرض الصورة/ })).toBeNull();
      expect(document.querySelector("img")).toBeNull();
      unmount();
    }
    const { dialog } = setup({ match: { ...match, closed: "ended" } });
    expect(within(dialog).queryByRole("button", { name: /عرض الصورة/ })).toBeNull();
  });
});
