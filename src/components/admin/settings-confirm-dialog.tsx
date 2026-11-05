"use client";

import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Confirmation before a risky admin save: what changes, line by line, and what members lose. */
export function SettingsConfirmDialog({
  open,
  title,
  description,
  lines = [],
  warnings = [],
  confirmLabel = "Save",
  destructive = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  lines?: string[];
  warnings?: string[];
  confirmLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {lines.length > 0 && (
          <ul className="space-y-1 rounded-lg border p-3 text-sm">
            {lines.map((line) => (
              <li key={line} className="break-words" dir="auto">{line}</li>
            ))}
          </ul>
        )}
        {warnings.map((w) => (
          <p key={w} className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {w}
          </p>
        ))}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
