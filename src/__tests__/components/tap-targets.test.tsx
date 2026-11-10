import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/input";
import { ChoiceGroup, DealbreakerToggle } from "@/components/profile/form-fields";
import { DialCodeToggle } from "@/components/shared/dial-code-toggle";
import { PersonCard } from "@/components/shared/person-card";
import { ChatStatusBar } from "@/components/chat/chat-status-bar";

/** QA WA-09: tap targets on phones are at least 44 px (h-11 / min-h-11) */
describe("tap targets ≥ 44 px on phones (QA WA-09)", () => {
  it("text inputs", () => {
    render(<Input aria-label="x" />);
    expect(screen.getByLabelText("x").className).toContain("max-md:min-h-11");
  });
  it("setup choice buttons and «شرط أساسي» chips", () => {
    render(
      <>
        <ChoiceGroup id="c" options={[{ value: "a", label: "أ" }]} isSelected={() => false} onSelect={vi.fn()} />
        <DealbreakerToggle id="d" checked={false} onChange={vi.fn()} />
      </>,
    );
    expect(screen.getByRole("button", { name: /أ/ }).className).toContain("min-h-11");
    expect(document.querySelector("label[for='d-dealbreaker']")!.className).toContain("max-md:min-h-11");
  });
  it("the dial-code toggle", () => {
    const { container } = render(<DialCodeToggle country="JO" onChange={vi.fn()} />);
    expect((container.firstElementChild as HTMLElement).className).toContain("h-11");
  });

  it("«عرض جميع التفاصيل» on a suggestion card (QA WM-03 / PA-M10)", () => {
    render(<PersonCard name="أحمد" details={<p>x</p>} expanded={false} onToggleExpand={vi.fn()} />);
    expect(screen.getByRole("button", { name: /عرض جميع التفاصيل/ }).className).toContain("min-h-11");
  });
  it("the chat status bar's action («تعارف عائلي») (QA DS-12)", () => {
    render(
      <ChatStatusBar
        bar="family"
        family="offer"
        daysLeft={9}
        canExtend={false}
        busy={false}
        onExtend={vi.fn()}
        onFamily={vi.fn()}
        matchHref="/dashboard/matches?match=x"
        pushBlocked={false}
        onPushDismiss={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "تعارف عائلي" }).className).toContain("min-h-11");
  });
  it("a selected choice shows a check, not only a faint tint (QA WM-23)", () => {
    const { container } = render(<ChoiceGroup id="r" options={[{ value: "a", label: "أب" }]} isSelected={() => true} onSelect={vi.fn()} />);
    const b = screen.getByRole("button", { name: /أب/ });
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(b.className).toContain("ring-primary");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
