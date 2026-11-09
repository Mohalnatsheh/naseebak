import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumberInput } from "@/components/shared/number-input";

function Harness() {
  const [v, setV] = useState("");
  return (
    <>
      <NumberInput aria-label="الطول" value={v} onChange={(e) => setV(e.target.value)} />
      <output>{v}</output>
    </>
  );
}

describe("NumberInput", () => {
  it("keeps Arabic-Indic digits as Western digits", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("الطول"), { target: { value: "١٧٨" } });
    expect(screen.getByRole("status").textContent).toBe("178");
  });

  it("drops anything that is not a digit", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("الطول"), { target: { value: "17a8 سم" } });
    expect(screen.getByRole("status").textContent).toBe("178");
  });

  it("opens the number keypad on phones", () => {
    render(<Harness />);
    expect(screen.getByLabelText("الطول").getAttribute("inputmode")).toBe("numeric");
  });
});
