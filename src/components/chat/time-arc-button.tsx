"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * S4: the partner's avatar with the chat's days as a gold arc. «متبقي N أيام» shows on hover (title) and on a tap (a
 * small bubble under it, for phones); screen readers get it in the name. A closed chat: just the avatar.
 */
export function TimeArcButton({ avatar, daysLeftLabel }: { avatar: ReactNode; daysLeftLabel: string | null }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), 2500);
    return () => clearTimeout(t);
  }, [shown]);
  if (!daysLeftLabel) return <span className="flex shrink-0 items-center">{avatar}</span>;
  return (
    <span className="relative flex shrink-0">
      <button
        type="button"
        data-testid="chat-time-arc"
        aria-label={`${daysLeftLabel} على المحادثة`}
        title={daysLeftLabel}
        onClick={() => setShown((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {avatar}
      </button>
      {shown && (
        <span
          role="status"
          className="animate-appear absolute top-full start-0 z-30 mt-1 whitespace-nowrap rounded-full bg-primary-deep px-3 py-1 text-caption font-semibold text-primary-foreground shadow-float"
        >
          {daysLeftLabel}
        </span>
      )}
    </span>
  );
}
