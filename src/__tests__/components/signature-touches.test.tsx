import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MatchSeal, SealMark, sealInitials } from "@/components/shared/match-seal";
import { MemberAvatar, chatTimeFraction } from "@/components/shared/member-avatar";

/* The signature touches (design review S1 seal, S2 veil, S3 majlis, S4 time arc) and their reduced-motion fallbacks */

const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");
const reducedBlock = css.slice(css.indexOf("Reduced motion everywhere"));

describe("S1 match seal", () => {
  it("the large seal draws both squares of the star (600 ms) around both initials", () => {
    const { container } = render(<MatchSeal initials={sealInitials("سامي", "ريم")} />);
    expect(screen.getByRole("img", { name: "توافق متبادل" })).toBeInTheDocument();
    expect(container.textContent).toContain("س · ر");
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    paths.forEach((p) => {
      expect(p.getAttribute("class")).toContain("animate-seal-draw");
      expect(p.getAttribute("pathLength")).toBe("1");
    });
  });

  it("the draw is the 600 ms seal keyframe, filled both ways, and ends at once under reduced motion", () => {
    expect(css).toMatch(/--animate-seal-draw: seal-draw 600ms [^;]+ both;/);
    expect(css).toMatch(/@keyframes seal-draw \{\s*from \{ stroke-dashoffset: 1; \}/);
    // Reduced motion: every animation finishes instantly, so the star is simply drawn (static)
    expect(reducedBlock).toContain("@media (prefers-reduced-motion: reduce)");
    expect(reducedBlock).toContain("animation-duration: 0.01ms !important");
  });

  it("the small mark is already drawn and never animates", () => {
    const { container } = render(<SealMark />);
    expect(screen.getByRole("img", { name: "توافق متبادل" })).toBeInTheDocument();
    container.querySelectorAll("path").forEach((p) => expect(p.getAttribute("class") ?? "").not.toContain("animate"));
  });

  it("no initials: a check in the centre", () => {
    expect(sealInitials("", null)).toBe("");
    const { container } = render(<MatchSeal initials="" animate={false} />);
    expect(container.querySelector("svg.lucide-check")).not.toBeNull();
    expect(container.querySelector("[data-slot=match-seal]")!.getAttribute("data-animate")).toBeNull();
  });
});

describe("S2 veil and reveal", () => {
  it("a hidden photo is the veil (initial, star pattern, lock); a revealed photo fades in from a blur", () => {
    const { container, rerender } = render(<MemberAvatar name="ليلى" locked size={64} />);
    expect(container.querySelector(".member-veil")).not.toBeNull();
    expect(container.querySelector("svg.lucide-lock")).not.toBeNull();
    rerender(<MemberAvatar name="ليلى" photoUrl="https://cdn.naseebak.com/a.jpg" reveal size={64} />);
    expect(container.querySelector("img")!.className).toContain("photo-reveal");
  });

  it("the reveal is 300 ms from blur(8px), and instant under reduced motion", () => {
    expect(css).toMatch(/@keyframes photo-reveal \{\s*from \{ filter: blur\(8px\)/);
    expect(css).toMatch(/\.photo-reveal \{ animation: photo-reveal 300ms/);
    expect(reducedBlock).toContain("animation-iteration-count: 1 !important");
  });
});

describe("S3 majlis", () => {
  it("sand with the gold star at 4%", () => {
    const block = css.slice(css.indexOf(".majlis {"), css.indexOf(".majlis-rule"));
    expect(block).toContain("var(--sand)");
    expect(block).toContain("stroke-opacity='.04'");
  });
});

describe("S4 time arc", () => {
  const day = 24 * 60 * 60 * 1000;
  it("share of 14 days, or 21 once extended; nothing once over", () => {
    const now = Date.UTC(2026, 10, 10);
    expect(chatTimeFraction(new Date(now + 7 * day), now)).toBeCloseTo(0.5);
    expect(chatTimeFraction(new Date(now + 18 * day), now)).toBeCloseTo(18 / 21);
    expect(chatTimeFraction(new Date(now - day), now)).toBeNull();
    expect(chatTimeFraction(null, now)).toBeNull();
  });

  it("draws a gold track and the arc for the time left; a static drawing (no animation to reduce)", () => {
    const { container } = render(<MemberAvatar name="سامي" size={42} timeLeft={0.25} />);
    const wrap = container.querySelector("[data-slot=time-arc]")!;
    expect(wrap.getAttribute("data-fraction")).toBe("0.25");
    const arc = container.querySelector("[data-arc]")!;
    const r = (42 - 2.5) / 2;
    const c = 2 * Math.PI * r;
    expect(arc.getAttribute("stroke-dasharray")).toBe(`${c * 0.25} ${c}`);
    expect(arc.getAttribute("class") ?? "").not.toContain("animate");
    // The face inside keeps the one avatar
    expect(wrap.querySelector("[data-slot=member-avatar]")).not.toBeNull();
  });

  it("no arc without a time", () => {
    const { container } = render(<MemberAvatar name="سامي" size={42} timeLeft={null} matched />);
    expect(container.querySelector("[data-slot=time-arc]")).toBeNull();
  });
});
