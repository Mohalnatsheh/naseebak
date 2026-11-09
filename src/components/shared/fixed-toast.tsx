"use client";

import { CheckCircle2, Sparkles, XCircle } from "lucide-react";

export type FixedToastMessage = { type: "success" | "info" | "error"; message: string };

/** The short notice at the top of the payments and Pro pages (one component, so the two never drift) */
export function FixedToast({ toast }: { toast: FixedToastMessage | null }) {
  if (!toast) return null;
  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border px-5 py-3 shadow-lg backdrop-blur-sm transition-all duration-300 ${
        toast.type === "success"
          ? "border-emerald-200 bg-emerald-50/95 text-emerald-800"
          : toast.type === "error"
            ? "border-destructive/20 bg-destructive/5 text-destructive"
            : "border-accent/30 bg-accent/10 text-accent-foreground"
      }`}
    >
      {toast.type === "success" ? (
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" aria-hidden />
      ) : toast.type === "error" ? (
        <XCircle className="h-5 w-5 flex-shrink-0 text-destructive" aria-hidden />
      ) : (
        <Sparkles className="h-5 w-5 flex-shrink-0 text-accent" aria-hidden />
      )}
      <span className="text-sm font-medium">{toast.message}</span>
    </div>
  );
}
