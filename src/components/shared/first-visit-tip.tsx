"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface FirstVisitTipProps {
  storageKey: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}

export function FirstVisitTip({ storageKey, icon, title, body }: FirstVisitTipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey);
    if (!dismissed) {
      setVisible(true);
    }
  }, [storageKey]);

  function dismiss() {
    localStorage.setItem(storageKey, "true");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="relative rounded-xl border border-primary/20 bg-gradient-to-l from-primary/5 to-primary/[0.02] p-4 mb-6">
      <button
        onClick={dismiss}
        className="absolute top-3 left-3 h-6 w-6 rounded-full bg-muted/80 flex items-center justify-center hover:bg-muted transition-colors"
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
