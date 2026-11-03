import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BirthDateSelect } from "@/components/profile/birth-date-select";

function Host({ initial = "", onValue }: { initial?: string; onValue: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return <BirthDateSelect id="dob" value={v} onChange={(x) => { setV(x); onValue(x); }} />;
}

const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("BirthDateSelect", () => {
  it("sends YYYY-MM-DD once day, month and year are chosen", () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    pick("اليوم", "7");
    pick("الشهر", "9");
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.getByText(/لإكمال تاريخ الميلاد/)).toBeTruthy();
    pick("السنة", "1996");
    expect(onValue).toHaveBeenLastCalledWith("1996-09-07");
    expect(screen.queryByText(/لإكمال تاريخ الميلاد/)).toBeNull();
  });

  it("shows a saved date and clears the value when a part is removed", () => {
    const onValue = vi.fn();
    render(<Host initial="1990-01-31" onValue={onValue} />);
    expect((screen.getByLabelText("اليوم") as HTMLSelectElement).value).toBe("31");
    expect((screen.getByLabelText("الشهر") as HTMLSelectElement).value).toBe("1");
    expect((screen.getByLabelText("السنة") as HTMLSelectElement).value).toBe("1990");
    pick("الشهر", "2"); // 31 Feb: the day is cleared, the date is incomplete
    expect(onValue).toHaveBeenLastCalledWith("");
    expect((screen.getByLabelText("اليوم") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("السنة") as HTMLSelectElement).value).toBe("1990");
  });

  it("fills in when the saved date arrives after the first render", () => {
    const { rerender } = render(<BirthDateSelect id="dob" value="" onChange={() => {}} />);
    rerender(<BirthDateSelect id="dob" value="1985-06-15" onChange={() => {}} />);
    expect((screen.getByLabelText("السنة") as HTMLSelectElement).value).toBe("1985");
    expect((screen.getByLabelText("اليوم") as HTMLSelectElement).value).toBe("15");
  });

  it("the day list is the labelled control", () => {
    render(<><label htmlFor="dob">تاريخ الميلاد</label><BirthDateSelect id="dob" value="" onChange={() => {}} /></>);
    expect(screen.getByLabelText("تاريخ الميلاد")).toBe(screen.getByLabelText("اليوم"));
  });
});
