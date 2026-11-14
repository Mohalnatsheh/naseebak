import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { pickBanner, PUSH_SNOOZE_MS, type BannerInput } from "@/lib/banner-slot";
import { pageWidth } from "@/lib/page-width";
import { MemberAvatar } from "@/components/shared/member-avatar";
import { EmptyState, LineArt, type LineArtKind } from "@/components/shared/line-art";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ─── The one banner slot (design review P1-5 / DS-05 / DS-06) ─── */

const base: BannerInput = {
  pathname: "/dashboard/photos",
  setupDone: true,
  creditOnInterest: true,
  credits: 3,
  likedYou: 0,
  pendingIntros: 0,
  pushNeeded: false,
  pushSnoozed: false,
};

describe("banner slot priority", () => {
  it("shows nothing when nothing waits", () => {
    expect(pickBanner(base)).toBeNull();
  });

  it("setup > 0 credits with likedYou > family request > push", () => {
    const all = { ...base, setupDone: false, credits: 0, likedYou: 2, pendingIntros: 1, pushNeeded: true };
    expect(pickBanner(all)).toBe("setup");
    expect(pickBanner({ ...all, setupDone: true })).toBe("zeroCredits");
    expect(pickBanner({ ...all, setupDone: true, credits: 1 })).toBe("familyRequest");
    expect(pickBanner({ ...all, setupDone: true, credits: 1, pendingIntros: 0 })).toBe("push");
    // A page's tip is never in the slot: it sits in the page content (P1-5, review X4a)
    expect(pickBanner({ ...all, setupDone: true, credits: 1, pendingIntros: 0, pushNeeded: false })).toBeNull();
  });

  it("0 credits alone is not a banner: only with someone's «مهتم» waiting, and only with credit on interest", () => {
    expect(pickBanner({ ...base, credits: 0 })).toBeNull();
    expect(pickBanner({ ...base, credits: 0, likedYou: 1, creditOnInterest: false })).toBeNull();
  });

  it("a snoozed push nudge leaves the slot empty; the snooze is one day (owner: daily)", () => {
    expect(pickBanner({ ...base, pushNeeded: true, pushSnoozed: true })).toBeNull();
    expect(PUSH_SNOOZE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("a new member's home shows no push card above the setup hero (DS-06)", () => {
    expect(pickBanner({ ...base, pathname: "/dashboard", setupDone: false, pushNeeded: true })).toBeNull();
    // Setup done: the push nudge may show on home
    expect(pickBanner({ ...base, pathname: "/dashboard", pushNeeded: true })).toBe("push");
  });

  it("suggestions at 0 credits: no push line above the page's own zero-credit note", () => {
    const zero = { ...base, pathname: "/dashboard/suggestions", credits: 0, pushNeeded: true };
    expect(pickBanner(zero)).toBeNull();
    // With credit the nudge shows there as before; other pages keep it at 0 credits; a family request still shows
    expect(pickBanner({ ...zero, credits: 1 })).toBe("push");
    expect(pickBanner({ ...zero, pathname: "/dashboard/photos" })).toBe("push");
    expect(pickBanner({ ...zero, creditOnInterest: false })).toBe("push");
    expect(pickBanner({ ...zero, pendingIntros: 1 })).toBe("familyRequest");
  });

  it("no slot in a chat room, the install guide or the setup itself", () => {
    for (const pathname of ["/dashboard/chats/abc", "/dashboard/install", "/dashboard/profile/setup"]) {
      expect(pickBanner({ ...base, pathname, setupDone: false, pushNeeded: true })).toBeNull();
    }
    // The chats list keeps it (its own install card is gone)
    expect(pickBanner({ ...base, pathname: "/dashboard/chats", pushNeeded: true })).toBe("push");
  });
});

describe("two page widths (P1-6 / DS-17)", () => {
  it("64rem for home, suggestions and payments; 42rem for forms, the chats list and account", () => {
    for (const p of ["/dashboard", "/dashboard/suggestions", "/dashboard/payments"]) expect(pageWidth(p)).toBe("wide");
    for (const p of ["/dashboard/account", "/dashboard/profile", "/dashboard/profile/edit", "/dashboard/chats", "/dashboard/photos"])
      expect(pageWidth(p)).toBe("narrow");
  });
});

/* ─── The banner slot component ─── */

const dash = vi.hoisted(() => ({
  value: {
    profile: { gender: "FEMALE", matchCredits: 0, profile: { isComplete: true } },
    completeness: { total: 80 },
    counts: { flags: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true, freeInterestReply: true }, pendingIntros: 0, likedYou: 1, credits: 0 },
    loading: false,
  },
}));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => dash.value }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/photos" }));
vi.mock("@/components/shared/push-setup", () => ({ usePushState: () => ({ stage: "allow", device: { os: "android" } }), PushSetupSheet: () => null }));

describe("BannerSlot", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });

  it("shows one line: the free reply for someone's «مهتم» at 0 credits, gendered", async () => {
    const { BannerSlot } = await import("@/components/shared/banner-slot");
    render(<BannerSlot />);
    const regions = screen.getAllByRole("region", { name: "تنبيه" });
    expect(regions).toHaveLength(1);
    expect(regions[0].getAttribute("data-banner")).toBe("zeroCredits");
    expect(screen.getByText("شخص مهتم بكِ ينتظر ردّكِ.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ردّي الآن/ }).getAttribute("href")).toBe("/dashboard/suggestions?tab=interested");
  });

  it("«لاحقاً» on the push line remembers the time and hides it", async () => {
    dash.value = { ...dash.value, counts: { ...dash.value.counts, likedYou: 0 } };
    const { BannerSlot } = await import("@/components/shared/banner-slot");
    render(<BannerSlot />);
    expect(screen.getByRole("region", { name: "تنبيه" }).getAttribute("data-banner")).toBe("push");
    const dismiss = screen.getByRole("button", { name: "لاحقاً" });
    expect(dismiss.className).toContain("h-11");
    fireEvent.click(dismiss);
    expect(Number(store.get("naseeb:push-nudge-snoozed-at"))).toBeGreaterThan(0);
    expect(screen.queryByRole("region", { name: "تنبيه" })).toBeNull();
  });
});

/* ─── One avatar (P2-5 / DS-24) ─── */

describe("MemberAvatar", () => {
  it("hidden photo: the initial on navy with a lock, never an image", () => {
    const { container } = render(<MemberAvatar name="ليلى" locked />);
    const el = container.querySelector("[data-slot=member-avatar]")!;
    expect(el.getAttribute("data-state")).toBe("locked");
    expect(el.textContent).toContain("ل");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".member-veil")!.className).toContain("from-primary");
    expect(screen.getByText("الصور تظهر بعد التوافق المتبادل")).toBeInTheDocument();
  });

  it("photo shown, gold ring when matched, gold dot for Pro, always a circle", () => {
    const { container } = render(<MemberAvatar name="خالد" photoUrl="https://cdn.naseebak.com/a.jpg" matched pro />);
    const el = container.querySelector("[data-slot=member-avatar]")!;
    expect(el.getAttribute("data-state")).toBe("photo");
    expect(el.className).toContain("rounded-full");
    expect(el.className).toContain("ring-accent");
    expect(container.querySelector("[data-slot=avatar-pro-dot]")!.className).toContain("bg-accent");
    expect(screen.getByRole("img", { name: "صورة خالد" })).toBeInTheDocument();
  });

  it("no ring or dot by default; dimmed when over", () => {
    const { container } = render(<MemberAvatar name="سلمى" dimmed />);
    const el = container.querySelector("[data-slot=member-avatar]")!;
    expect(el.className).not.toContain("ring-accent");
    expect(container.querySelector("[data-slot=avatar-pro-dot]")).toBeNull();
    expect(container.querySelector(".member-veil")!.className).toContain("bg-muted");
  });
});

/* ─── Line-art empty states (P2-2 / S5) ─── */

describe("line-art empty states", () => {
  it("draws every kind at 120 px, decorative, in navy with a gold touch", () => {
    const kinds: LineArtKind[] = ["dallah", "envelope", "cupsTray", "door", "window", "lantern", "wallet"];
    for (const kind of kinds) {
      const { container, unmount } = render(<LineArt kind={kind} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("width")).toBe("120");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(container.innerHTML).toContain("var(--primary)");
      expect(container.innerHTML).toContain("var(--accent)");
      unmount();
    }
  });

  it("EmptyState: art, heading and actions", () => {
    render(
      <EmptyState art="lantern" title="لا توجد إشعارات" description="ستظهر هنا">
        <button type="button">زر</button>
      </EmptyState>
    );
    expect(screen.getByRole("heading", { name: "لا توجد إشعارات" })).toBeInTheDocument();
    expect(document.querySelector("[data-line-art=lantern]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "زر" })).toBeInTheDocument();
  });
});

/* ─── Colour rules in the variants (P2-4 / DS-16 / DS-18) ─── */

describe("button and badge colour rules", () => {
  it("gold fill is its own variant (for navy surfaces); the main button is navy; «cta» is 48 px", () => {
    render(
      <>
        <Button>أساسي</Button>
        <Button variant="gold">ذهبي</Button>
        <Button variant="neutral" size="cta">لا</Button>
      </>
    );
    expect(screen.getByRole("button", { name: "أساسي" }).className).toContain("bg-primary");
    expect(screen.getByRole("button", { name: "ذهبي" }).className).toContain("bg-accent");
    const no = screen.getByRole("button", { name: "لا" });
    expect(no.className).toContain("h-12");
    expect(no.className).not.toContain("bg-destructive");
  });

  it("badges: red only for urgent, navy for counts, gold for good news", () => {
    render(
      <>
        <Badge variant="urgent">1</Badge>
        <Badge variant="count">2</Badge>
        <Badge variant="news">3</Badge>
      </>
    );
    expect(screen.getByText("1").className).toContain("bg-destructive");
    expect(screen.getByText("2").className).toContain("bg-primary");
    expect(screen.getByText("3").className).toContain("bg-accent");
  });
});

/* ─── One auth shell (P2-3 / DS-07 / DS-08) ─── */

describe("AuthShell", () => {
  it("the split layout with the brand panel, the form column and the gold top rule; no full-page photo behind the form", async () => {
    const { AuthShell, AuthCardRule } = await import("@/components/shared/auth-shell");
    const { container } = render(
      <AuthShell tagline="سطر" width="lg">
        <div className="relative">
          <AuthCardRule />
          <p>نموذج</p>
        </div>
      </AuthShell>
    );
    const main = container.querySelector("main")!;
    expect(main.className).toContain("flex-row-reverse");
    expect(screen.getByText("نموذج").closest(".max-w-lg")).not.toBeNull();
    // The photo lives only in the wide-screen panel (hidden on phones)
    const photo = container.querySelector("img[src*='auth']")!;
    expect(photo.closest(".hidden.lg\\:flex")).not.toBeNull();
    expect(container.innerHTML).toContain("from-accent");
  });
});

/* ─── WhatsApp-style chat tokens ─── */

describe("chat design tokens", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync("src/app/globals.css", "utf8");
  const darkStart = css.indexOf("\n.dark {");
  const themeStart = css.indexOf("@theme inline");
  const light = css.slice(css.indexOf(":root {"), darkStart);
  const dark = css.slice(darkStart, themeStart);
  for (const name of ["bubble-mine", "bubble-mine-quote", "chat-select", "chat-chip", "safety-chip"]) {
    it(`--${name} is defined in light and dark and mapped to a colour`, () => {
      expect(light).toMatch(new RegExp(`--${name}:`));
      expect(dark).toMatch(new RegExp(`--${name}:`));
      expect(css).toContain(`--color-${name}: var(--${name});`);
    });
  }
});
