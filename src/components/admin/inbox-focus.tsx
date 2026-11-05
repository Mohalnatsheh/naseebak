"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const noSubscribe = () => () => {};

/**
 * `?id=` on a queue page: the Inbox's «Open» link shows just that item. Read after mount, because
 * `useSearchParams` would need a Suspense boundary. `ready` is false until then: wait for it
 * before loading so the page doesn't fetch the whole list first.
 */
export function useFocusId() {
  // null while rendering on the server, the query string once in the browser
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => null);
  const [cleared, setCleared] = useState(false);

  function clearFocus() {
    window.history.replaceState(null, "", window.location.pathname);
    setCleared(true);
  }

  const focusId = search && !cleared ? new URLSearchParams(search).get("id") : null;
  return { ready: search !== null, focusId, clearFocus };
}

/** Shown above a queue page while it is narrowed to one item */
export function FocusBanner({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">Showing one item from the Inbox.</span>
      <Button size="sm" variant="outline" onClick={onClear}>Show all</Button>
    </div>
  );
}

/** Load-error state of a queue page, so a failed load never reads as an empty list */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <span>{message}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>
    </div>
  );
}
