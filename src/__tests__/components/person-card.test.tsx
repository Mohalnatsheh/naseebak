import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GraduationCap, Flag } from "lucide-react";
import { PersonCard, scoreLabel } from "@/components/shared/person-card";

describe("PersonCard", () => {
  it("shows name, age, city, score and only the tags that have a value", () => {
    render(
      <PersonCard
        name="سارة"
        age={27}
        city="عمّان"
        area="خلدا"
        score={82.4}
        tags={[
          { icon: GraduationCap, label: "بكالوريوس" },
          { icon: Flag, label: null },
        ]}
      />
    );
    expect(screen.getByRole("heading", { name: "سارة" })).toBeInTheDocument();
    expect(screen.getByText("27 سنة")).toBeInTheDocument();
    expect(screen.getByText(/عمّان - خلدا/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "نسبة التوافق 82%" })).toBeInTheDocument();
    expect(screen.getByText(scoreLabel(82))).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("hides the score ring when there is no score", () => {
    render(<PersonCard name="أحمد" />);
    expect(screen.queryByRole("img", { name: /نسبة التوافق/ })).not.toBeInTheDocument();
  });

  it("uses the photo only when one is passed, otherwise a locked placeholder", () => {
    const { rerender } = render(<PersonCard name="أحمد" photoLocked />);
    expect(screen.queryByRole("img", { name: "صورة أحمد" })).not.toBeInTheDocument();
    expect(screen.getByText("الصور تظهر بعد الاهتمام المتبادل")).toBeInTheDocument();
    rerender(<PersonCard name="أحمد" photoLocked photoUrl="https://cdn.naseebak.com/x.jpg" />);
    expect(screen.getByRole("img", { name: "صورة أحمد" })).toHaveAttribute("src", "https://cdn.naseebak.com/x.jpg");
  });

  it("renders the details toggle as a controlled expander and the slots", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <PersonCard name="أحمد" details={<p>تفاصيل</p>} expanded={false} onToggleExpand={onToggle} actions={<button>قبول</button>}>
        <p>محتوى خاص</p>
      </PersonCard>
    );
    const toggle = screen.getByRole("button", { name: /عرض جميع التفاصيل/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("تفاصيل")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(screen.getByText("محتوى خاص")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "قبول" })).toBeInTheDocument();

    rerender(
      <PersonCard name="أحمد" details={<p>تفاصيل</p>} expanded onToggleExpand={onToggle} />
    );
    expect(screen.getByText("تفاصيل")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /إخفاء التفاصيل/ })).toHaveAttribute("aria-expanded", "true");
  });
});
