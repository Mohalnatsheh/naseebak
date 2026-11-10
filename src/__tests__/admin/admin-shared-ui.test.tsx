import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ConfirmProvider, useConfirm } from "@/components/admin/confirm-dialog";
import { AdminLoadError, AdminEmptyState } from "@/components/admin/admin-states";
import { PersonLink, NameText } from "@/components/admin/admin-list-bits";
import { Dialog, DialogContent, DialogTitle, DialogCloseLabelProvider } from "@/components/ui/dialog";

function Asker({ onResult, input }: { onResult: (v: unknown) => void; input?: boolean }) {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () => {
        const base = { title: "Remove this block?", description: "Both see each other again.", confirmLabel: "Remove", destructive: true };
        onResult(input ? await confirm({ ...base, input: { label: "Reason", multiline: true, required: true } }) : await confirm(base));
      }}
    >
      ask
    </button>
  );
}

describe("ConfirmDialog (ADM-12)", () => {
  it("resolves true on confirm and false on cancel", async () => {
    const onResult = vi.fn();
    render(
      <ConfirmProvider>
        <Asker onResult={onResult} />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByText("ask"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Remove this block?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));

    fireEvent.click(screen.getByText("ask"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(false));
  });

  it("asks for a required reason in a textarea and resolves it, or null on cancel", async () => {
    const onResult = vi.fn();
    render(
      <ConfirmProvider>
        <Asker onResult={onResult} input />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByText("ask"));
    const box = (await screen.findByLabelText("Reason")) as HTMLTextAreaElement;
    expect(box.tagName).toBe("TEXTAREA");
    const ok = screen.getByRole("button", { name: "Remove" }) as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "  fake photos " } });
    expect(ok.disabled).toBe(false);
    fireEvent.click(ok);
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("fake photos"));

    fireEvent.click(screen.getByText("ask"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(null));
  });

  it("the dialog's close button is named in English", async () => {
    render(
      <ConfirmProvider>
        <Asker onResult={() => {}} />
      </ConfirmProvider>,
    );
    await act(async () => fireEvent.click(screen.getByText("ask")));
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });
});

describe("admin dialog close label (ADM-13 / WP2-10)", () => {
  it("defaults to Arabic and follows the provider", () => {
    const { unmount } = render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>t</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeTruthy();
    unmount();
    render(
      <DialogCloseLabelProvider label="Close">
        <Dialog open>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>t</DialogTitle>
          </DialogContent>
        </Dialog>
      </DialogCloseLabelProvider>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });
});

describe("admin load states (ADM-04)", () => {
  it("LoadError is an alert with a working «Try again»", () => {
    const retry = vi.fn();
    render(<AdminLoadError message="Couldn't load users." onRetry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load users.");
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(retry).toHaveBeenCalled();
  });

  it("EmptyState shows its title", () => {
    render(<AdminEmptyState title="No blocks" hint="Nobody has blocked anyone." />);
    expect(screen.getByText("No blocks")).toBeTruthy();
  });
});

describe("bidi isolation (ADM-05)", () => {
  it("PersonLink wraps the name in <bdi>", () => {
    const { container } = render(<PersonLink p={{ id: "u1", firstName: "سلمى", lastName: "أحمد" }} />);
    expect(container.querySelector("bdi")?.textContent).toBe("سلمى أحمد");
  });
  it("NameText isolates a plain name", () => {
    const { container } = render(<NameText>ماجد</NameText>);
    expect(container.querySelector("bdi")?.textContent).toBe("ماجد");
  });
});
