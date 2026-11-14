import { describe, it, afterEach, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({ profile: { gender: "MALE" }, country: "JO", counts: {} }),
}));

import { MemberAvatar } from "@/components/shared/member-avatar";
import { PersonCard } from "@/components/shared/person-card";
import { SuggestionCard } from "@/components/suggestions/suggestion-card";
import { ProfileSheet } from "@/components/suggestions/profile-sheet";
import type { FeedItem } from "@/lib/suggestions/feed-types";

/** Blurred photo preview (spec 2026-11-14): a locked avatar shows the server's tiny pre-blurred copy under a blur */

const PREVIEW = "data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=";

function previewImg(container: HTMLElement) {
  return container.querySelector<HTMLImageElement>("[data-slot=member-avatar] img");
}

const candidate = {
  id: "c1", firstName: "نسرين", isVerified: false, age: 27, city: "عمّان", area: null,
  nationality: null, education: "بكالوريوس", fieldOfStudy: null, job: "معلمة", incomeRange: null,
  height: 165, weight: null, skinColor: null, maritalStatus: "عزباء", childrenCount: 0, religiosity: "ملتزم",
  smokingStatus: "لا", sect: null, aboutMe: "أحب القراءة", hobbies: null, interests: null,
  lifestyle: null, beard: null, hijab: true, niqab: false, tribe: null, familyOriginArea: null,
  numberOfSiblings: null, housingType: null, cookingAbility: null, drivingLicense: null,
  willingToRelocate: null, familyValues: null,
};
function feedItem(photoPreview: string | null) {
  return {
    kind: "mutual", id: "s1", compatibilityScore: 80, reason: "x", createdAt: "2026-11-13T00:00:00Z",
    candidate: { ...candidate, photoPreview },
  } as unknown as FeedItem;
}

describe("MemberAvatar with a blurred preview", () => {
  afterEach(cleanup);

  it("locked + preview: the preview covers the circle under a CSS blur, lock kept, no initial", () => {
    const { container } = render(<MemberAvatar name="ليلى" locked photoPreview={PREVIEW} size={56} />);
    const el = container.querySelector("[data-slot=member-avatar]")!;
    expect(el.getAttribute("data-state")).toBe("preview");
    const img = previewImg(container)!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe(PREVIEW);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.className).toContain("object-cover");
    expect(img.style.filter).toMatch(/blur\(\d+(\.\d+)?px\)/);
    expect(container.querySelector("[data-slot=avatar-lock]")).not.toBeNull();
    expect(el.querySelector("[aria-hidden]")!.textContent).toBe("");
    expect(screen.getByText("الصور تظهر بوضوح بعد الاهتمام المتبادل")).toBeInTheDocument();
  });

  it("locked without a preview: the initial veil as before, no image", () => {
    const { container } = render(<MemberAvatar name="ليلى" locked photoPreview={null} />);
    expect(container.querySelector("[data-slot=member-avatar]")!.getAttribute("data-state")).toBe("locked");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("ل");
  });

  it("not locked: a preview is ignored (never shown outside a locked avatar)", () => {
    const { container } = render(<MemberAvatar name="ليلى" photoPreview={PREVIEW} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-slot=member-avatar]")!.getAttribute("data-state")).toBe("initial");
  });

  it("a real photo wins over the preview", () => {
    render(<MemberAvatar name="خالد" locked photoPreview={PREVIEW} photoUrl="https://cdn.naseebak.com/a.jpg" />);
    expect(screen.getByRole("img", { name: "صورة خالد" })).toHaveAttribute("src", "https://cdn.naseebak.com/a.jpg");
  });

  it("only data:image/ previews are drawn (anything else falls back to the initial)", () => {
    const { container } = render(<MemberAvatar name="ليلى" locked photoPreview="https://cdn.naseebak.com/x.jpg" />);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("cards pass the preview to the locked avatar", () => {
  afterEach(cleanup);

  it("PersonCard", () => {
    const { container } = render(<PersonCard name="أحمد" photoLocked photoPreview={PREVIEW} />);
    expect(previewImg(container)?.getAttribute("src")).toBe(PREVIEW);
  });

  it("SuggestionCard: preview or the initial", () => {
    const props = { partnerGender: "FEMALE" as const, country: "JO" as const, onOpen: () => {}, actions: null };
    const { container, unmount } = render(<SuggestionCard item={feedItem(PREVIEW)} {...props} />);
    expect(previewImg(container)?.getAttribute("src")).toBe(PREVIEW);
    unmount();
    const again = render(<SuggestionCard item={feedItem(null)} {...props} />);
    expect(previewImg(again.container)).toBeNull();
  });

  it("ProfileSheet: preview and the «بوضوح» line", async () => {
    render(<ProfileSheet item={feedItem(PREVIEW)} onClose={() => {}} footer={null} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("[data-slot=member-avatar] img")?.getAttribute("src")).toBe(PREVIEW);
    expect(within(dialog).getByText("الصور تظهر بوضوح بعد التوافق المتبادل فقط")).toBeTruthy();
  });

  it("the other pre-match lists pass candidate.photoPreview", () => {
    const root = process.cwd();
    for (const f of [
      "src/components/dashboard/home-v2.tsx",
      "src/app/(ar)/dashboard/page.tsx",
      "src/components/suggestions/mutual-suggestions-view.tsx",
    ]) {
      expect(readFileSync(join(root, f), "utf8"), f).toMatch(/photoPreview=\{[^}]*\.photoPreview\}/);
    }
    const legacy = readFileSync(join(root, "src/app/(ar)/dashboard/suggestions/page.tsx"), "utf8");
    expect(legacy.match(/photoPreview=\{/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

describe("photo wording: blurred, not hidden", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

  it("no member-facing «الصور مخفية حتى التوافق» left", () => {
    for (const f of [
      "src/components/landing/content.ts",
      "src/components/landing/sticky-start.tsx",
      "src/components/shared/auth-shell.tsx",
      "src/components/profile/setup/setup-done.tsx",
      "src/app/(ar)/faq/faq-data.ts",
      "src/app/(ar)/about/page.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/مخفية (حتى|لحدّ|تماماً|كلّياً|عن)/);
    }
    expect(read("src/components/landing/content.ts")).toContain("الصور ضبابية حتى التوافق");
    expect(read("src/components/profile/setup/setup-done.tsx")).toContain("ضبابية حتى التوافق المتبادل");
  });

  it("privacy policy, FAQ and the photos page say a strongly blurred preview shows before a match", () => {
    const privacy = read("src/app/(ar)/privacy/page.tsx");
    expect(privacy.match(/نسخة ضبابية جداً من صورتك الرئيسية/g)?.length).toBe(3);
    expect(privacy).not.toContain("لا تظهر صورك إلا للطرف");
    const faq = read("src/app/(ar)/faq/faq-data.ts");
    expect(faq.match(/نسخة ضبابية جداً من صورتك الرئيسية/g)?.length).toBe(2);
    expect(faq).toContain("نسخة ضبابية كتير من صورتك الرئيسية");
    expect(read("src/app/(ar)/dashboard/photos/page.tsx")).toContain("نسخة ضبابية جداً من صورتك الرئيسية");
  });
});
