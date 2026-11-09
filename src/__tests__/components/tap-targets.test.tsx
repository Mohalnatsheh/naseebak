import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/input";
import { ChoiceGroup, DealbreakerToggle } from "@/components/profile/form-fields";
import { DialCodeToggle } from "@/components/shared/dial-code-toggle";

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
});
