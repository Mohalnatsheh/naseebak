"use client";

import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The one confirmation of the admin panel (replaces `window.confirm` / `prompt`).
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Remove this block?", destructive: true }))) return;
 *   const reason = await confirm({ title: "Flag member", input: { label: "Reason", multiline: true, required: true } });
 *
 * Without `input` it resolves true / false; with `input` it resolves the trimmed text, or null on cancel.
 */
export interface ConfirmInput {
  label: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  defaultValue?: string;
  maxLength?: number;
}

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  /** Shown in a red box under the description */
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  input?: ConfirmInput;
}

type Confirm = {
  (opts: ConfirmOptions & { input: ConfirmInput }): Promise<string | null>;
  (opts: ConfirmOptions & { input?: undefined }): Promise<boolean>;
};

const ConfirmContext = createContext<Confirm | null>(null);

export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm needs <ConfirmProvider> (the admin layout has one)");
  return ctx;
}

interface Pending {
  opts: ConfirmOptions;
  resolve: (v: boolean | string | null) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const settled = useRef(false);
  const fieldId = useId();

  const ask = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean | string | null>((resolve) => {
        settled.current = false;
        setText(opts.input?.defaultValue ?? "");
        setPending({ opts, resolve });
      }),
    [],
  );
  const confirm = ask as Confirm;

  function finish(ok: boolean) {
    if (!pending || settled.current) return;
    settled.current = true;
    const { opts, resolve } = pending;
    if (opts.input) resolve(ok ? text.trim() : null);
    else resolve(ok);
    setPending(null);
  }

  const opts = pending?.opts;
  const input = opts?.input;
  const blocked = !!input?.required && text.trim() === "";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!pending} onOpenChange={(o) => !o && finish(false)}>
        <DialogContent closeLabel="Close" aria-describedby={undefined}>
          {opts && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!blocked) finish(true);
              }}
            >
              <DialogHeader>
                <DialogTitle>{opts.title}</DialogTitle>
                {opts.description && <DialogDescription>{opts.description}</DialogDescription>}
              </DialogHeader>
              {opts.warning && (
                <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {opts.warning}
                </p>
              )}
              {input && (
                <div className="grid gap-1.5">
                  <Label htmlFor={fieldId}>{input.label}</Label>
                  {input.multiline ? (
                    <textarea
                      id={fieldId}
                      dir="auto"
                      rows={3}
                      autoFocus
                      value={text}
                      maxLength={input.maxLength}
                      placeholder={input.placeholder}
                      onChange={(e) => setText(e.target.value)}
                      className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
                    />
                  ) : (
                    <Input
                      id={fieldId}
                      dir="auto"
                      autoFocus
                      value={text}
                      maxLength={input.maxLength}
                      placeholder={input.placeholder}
                      onChange={(e) => setText(e.target.value)}
                    />
                  )}
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => finish(false)}>
                  {opts.cancelLabel ?? "Cancel"}
                </Button>
                <Button type="submit" variant={opts.destructive ? "destructive" : "default"} disabled={blocked}>
                  {opts.confirmLabel ?? "Confirm"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
