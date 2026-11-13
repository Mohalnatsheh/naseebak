import { describe, it, afterEach, expect, vi } from "vitest";
import { useState, StrictMode } from "react";
import { cleanup, render, screen, fireEvent, within, act } from "@testing-library/react";

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
  afterEach(async () => { cleanup(); await new Promise((r) => setTimeout(r, 20)); });

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

  it("rounds the score (a Float in the schema)", () => {
    render(<ProfileSheet item={{ ...item, compatibilityScore: 82.6 } as FeedItem} onClose={() => {}} footer={null} />);
    expect(within(screen.getByRole("dialog")).getByText("توافق 83%")).toBeTruthy();
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

  function Host({ items }: { items: FeedItem[] }) {
    const [i, setI] = useState<number | null>(null);
    return (
      <>
        <button onClick={() => setI(0)}>OPEN</button>
        <button onClick={() => setI(1)}>OPEN2</button>
        <ProfileSheet item={i === null ? null : items[i]} onClose={() => setI(null)} footer={null} />
      </>
    );
  }
  const item2 = { ...item, id: "s2" } as FeedItem;
  const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

  it("stays open under StrictMode with a single #profile entry", async () => {
    window.history.replaceState(null, "", "/");
    const push = vi.spyOn(window.history, "pushState");
    render(<StrictMode><Host items={[item, item2]} /></StrictMode>);
    fireEvent.click(screen.getByText("OPEN"));
    await tick();
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(window.location.hash).toBe("#profile");
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it("removes the entry once on ✕, and switching items adds none", async () => {
    window.history.replaceState(null, "", "/");
    const back = vi.spyOn(window.history, "back");
    const push = vi.spyOn(window.history, "pushState");
    render(<Host items={[item, item2]} />);
    fireEvent.click(screen.getByText("OPEN"));
    await tick();
    expect(push).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("OPEN2")); // behind the overlay in a browser; fine in jsdom
    await tick();
    expect(push).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    await tick();
    expect(back).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
    back.mockRestore();
    push.mockRestore();
  });

  it("gives the focus back to what opened it", async () => {
    render(<Host items={[item, item2]} />);
    const opener = screen.getByText("OPEN");
    opener.focus();
    fireEvent.click(opener);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    await tick();
    expect(document.activeElement).toBe(opener);
  });
});
