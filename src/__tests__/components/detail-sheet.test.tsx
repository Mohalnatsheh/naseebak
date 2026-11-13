import { describe, it, afterEach, expect, vi } from "vitest";
import { useState, StrictMode } from "react";
import { cleanup, render, screen, fireEvent, within, act } from "@testing-library/react";
import { DetailSheet } from "@/components/shared/detail-sheet";
import { SheetTitle } from "@/components/ui/sheet";

function Host({ onClose }: { onClose?: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  return (
    <>
      <button onClick={() => setKey("a")}>OPEN</button>
      <button onClick={() => setKey("b")}>OPEN2</button>
      <DetailSheet
        open={key !== null}
        onClose={() => {
          onClose?.();
          setKey(null);
        }}
        title="عنوان"
        menu={<button>MENU</button>}
        footer={<div>FOOT</div>}
      >
        <SheetTitle>BODY {key}</SheetTitle>
      </DetailSheet>
    </>
  );
}

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

describe("DetailSheet", () => {
  afterEach(async () => { cleanup(); await new Promise((r) => setTimeout(r, 20)); });

  it("renders nothing while closed, then children, menu and footer", async () => {
    window.history.replaceState(null, "", "/");
    render(<Host />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("OPEN"));
    await tick();
    const dialog = screen.getByRole("dialog");
    for (const t of ["BODY a", "MENU", "FOOT"]) expect(within(dialog).getByText(t)).toBeTruthy();
  });

  it("closes with ✕ and Escape", async () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    fireEvent.click(screen.getByText("OPEN"));
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    await tick();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("OPEN"));
    await tick();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await tick();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes on popstate", async () => {
    window.history.replaceState(null, "", "/");
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    fireEvent.click(screen.getByText("OPEN"));
    await tick();
    expect(window.location.hash).toBe("#profile");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("adds a single history entry under StrictMode", async () => {
    window.history.replaceState(null, "", "/");
    const push = vi.spyOn(window.history, "pushState");
    render(<StrictMode><Host /></StrictMode>);
    fireEvent.click(screen.getByText("OPEN"));
    await tick();
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it("returns the focus to the opener", async () => {
    render(<Host />);
    const opener = screen.getByText("OPEN");
    opener.focus();
    fireEvent.click(opener);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    await tick();
    expect(document.activeElement).toBe(opener);
  });
});
