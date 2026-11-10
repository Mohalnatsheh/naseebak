"use client";

import type { ReactNode, RefObject } from "react";
import { returnFocusTo } from "@/lib/dialog-focus";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Red confirm button (block, report) */
  destructive?: boolean;
  busy?: boolean;
  /** Extra content between the description and the buttons (e.g. a reason picker) */
  children?: ReactNode;
  onConfirm: () => void;
  /** Opened from a menu: where the focus goes back on close (the menu's button) */
  returnFocus?: RefObject<HTMLElement | null>;
}

/** A small "are you sure?" dialog for match actions (cancel a request, block, unblock). */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  busy,
  children,
  onConfirm,
  returnFocus,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent dir="rtl" className="sm:max-w-md text-right" onCloseAutoFocus={returnFocus ? returnFocusTo(returnFocus) : undefined}>
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="text-right leading-relaxed">{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          <Button
            onClick={onConfirm}
            disabled={busy}
            variant={destructive ? "destructive" : "default"}
            className="flex-1 sm:flex-none min-w-28"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} className="flex-1 sm:flex-none">
            تراجع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
