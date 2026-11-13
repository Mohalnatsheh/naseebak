import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({ profile: { gender: "MALE" }, country: "JO" }),
}));

import { ProfileSheet } from "@/components/suggestions/profile-sheet";
import type { FeedItem } from "@/lib/suggestions/feed-types";

const item = {
  kind: "mutual",
  id: "s1",
  compatibilityScore: 82,
  reason: "تتفقان على الاستقرار",
  createdAt: "2026-11-13T00:00:00Z",
  activity: "نشطة اليوم",
  candidate: {
    id: "c1", firstName: "سارة", isVerified: false, age: 27, city: "عمّان", area: "الجبيهة",
    nationality: "أردنية", education: "بكالوريوس", fieldOfStudy: "تمريض", job: "معلمة", incomeRange: "متوسط",
    height: 165, weight: 60, skinColor: null, maritalStatus: "عزباء", childrenCount: 0, religiosity: "ملتزم",
    smokingStatus: "لا", sect: null, aboutMe: "أحب القراءة والهدوء", hobbies: "القراءة،السفر", interests: "الطبخ",
    lifestyle: "هادئ", beard: null, hijab: true, niqab: false, tribe: "العبادي", familyOriginArea: "السلط",
    numberOfSiblings: 3, housingType: "مستقل", cookingAbility: "ممتاز", drivingLicense: true,
    willingToRelocate: "yes", familyValues: "الاحترام",
  },
} as unknown as FeedItem;

describe("ProfileSheet", () => {
  it("shows the whole profile in one scroll with nothing collapsed", () => {
    render(<ProfileSheet item={item} onClose={() => {}} footer={<div>FOOT</div>} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/سارة/)).toBeTruthy();
    expect(within(dialog).getByText("الصور تظهر بعد التوافق المتبادل فقط")).toBeTruthy();
    expect(within(dialog).getByText("تتفقان على الاستقرار")).toBeTruthy();
    expect(within(dialog).getByText("أحب القراءة والهدوء")).toBeTruthy();
    expect(within(dialog).getByText("عنها")).toBeTruthy();
    for (const label of [
      "المعلومات الشخصية", "التعليم والعمل", "الدين ونمط الحياة", "العائلة", "الهوايات والاهتمامات",
      "المدينة", "الجنسية", "المستوى التعليمي", "الوظيفة", "مستوى التدين", "عدد الإخوة", "القيم العائلية",
    ]) {
      expect(within(dialog).getByText(label), label).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: /إخفاء/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /عرض جميع التفاصيل/ })).toBeNull();
    expect(within(dialog).queryAllByRole("button", { expanded: true })).toEqual([]);
  });

  it("renders the footer and the menu", () => {
    render(<ProfileSheet item={item} onClose={() => {}} footer={<div>FOOT</div>} menu={<button>MENU</button>} />);
    expect(screen.getByText("FOOT")).toBeTruthy();
    expect(screen.getByText("MENU")).toBeTruthy();
  });

  it("closes with Escape and with the ✕ button", () => {
    const onClose = vi.fn();
    const { unmount } = render(<ProfileSheet item={item} onClose={onClose} footer={null} />);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    const onClose2 = vi.fn();
    render(<ProfileSheet item={item} onClose={onClose2} footer={null} />);
    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    expect(onClose2).toHaveBeenCalledTimes(1);
  });

  it("closes on browser back", () => {
    const onClose = vi.fn();
    render(<ProfileSheet item={item} onClose={onClose} footer={null} />);
    expect(window.location.hash).toBe("#profile");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing without an item", () => {
    render(<ProfileSheet item={null} onClose={() => {}} footer={<div>FOOT</div>} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("FOOT")).toBeNull();
  });
});
