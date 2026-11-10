import type { RefObject } from "react";

/**
 * Radix `onOpenAutoFocus` for a dialog or sheet that must not highlight its first control (it would look like a
 * default choice): the focus goes to the dialog itself, so the keyboard is inside it and a screen reader announces
 * its title (QA PA-H1). Never `preventDefault()` alone: that leaves the focus behind the dialog.
 */
export function focusDialogItself(e: Event) {
  e.preventDefault();
  const el = (e.currentTarget ?? e.target) as HTMLElement | null;
  el?.focus?.({ preventScroll: true });
}

/**
 * Radix `onCloseAutoFocus` for a dialog opened from a menu item (gone once the menu closed, so the focus would fall to
 * the page body): back to `ref` — the menu's button, or the message the menu belonged to (QA PA-M9).
 */
export function returnFocusTo(ref: RefObject<HTMLElement | null> | undefined) {
  return (e: Event) => {
    const el = ref?.current;
    if (!el || !el.isConnected) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
  };
}
