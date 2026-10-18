"use client";

import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";

interface FirstVisitTipProps {
  storageKey: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}

const subscribeNoop = () => () => {};

export function FirstVisitTip({ storageKey, icon, title, body }: FirstVisitTipProps) {
  // Read localStorage only in the browser (hidden during server render and hydration)
  const dismissedBefore = useSyncExternalStore(
    subscribeNoop,
    () => !!localStorage.getItem(storageKey),
    () => true
  );
  const [dismissedNow, setDismissedNow] = useState(false);
  const visible = !dismissedBefore && !dismissedNow;

  function dismiss() {
    localStorage.setItem(storageKey, "true");
    setDismissedNow(true);
  }

  if (!visible) return null;

  return (
    <div className="relative rounded-xl border border-primary/20 bg-gradient-to-l from-primary/5 to-primary/[0.02] p-4 mb-6">
      <button
        onClick={dismiss}
        type="button"
        aria-label="إخفاء النصيحة"
        className="absolute top-1.5 end-1.5 h-11 w-11 rounded-full bg-muted/80 flex items-center justify-center hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3 w-3 text-muted-foreground" />
      </button>
      <div className="flex items-start gap-3 pe-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h4 className="text-sm font-bold text-foreground mb-1">{title}</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
        </div>
      </div>
    </div>
  );
}
