"use client";

import { createContext, useContext } from "react";

/**
 * Roving focus in the message list (QA WC2-06): one Tab stop for the whole list. The current row is tabbable and its
 * controls (quote, photo, play, reactions, options) follow it; every other row and its controls are -1. ↑ / ↓ move
 * between rows, Home / End jump, Enter (or the menu key) opens the row's menu.
 * `undefined` (a bubble outside the room, e.g. a test): the controls keep their own order.
 */
export const RowTabContext = createContext<-1 | undefined>(undefined);

/** The tabIndex for a control inside a message row */
export function useRowTabIndex(): -1 | undefined {
  return useContext(RowTabContext);
}

/** The row to focus after an arrow key on `from`, or null (not an arrow / no row there) */
export function rowAfterKey(from: HTMLElement, key: string): HTMLElement | null {
  const list = from.closest("[data-message-list]");
  if (!list) return null;
  const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-message-row]"));
  const i = rows.indexOf(from);
  if (i < 0) return null;
  const target = key === "ArrowUp" ? i - 1 : key === "ArrowDown" ? i + 1 : key === "Home" ? 0 : key === "End" ? rows.length - 1 : -1;
  return target >= 0 && target < rows.length && target !== i ? rows[target] : null;
}
