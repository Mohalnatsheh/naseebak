import { Children, isValidElement, type ReactNode } from "react";

/**
 * Whether a details section has anything to show. A row component (`row`) hides itself when its `value` is
 * empty, so a section whose rows are all empty would show only its heading: callers render nothing instead.
 * Anything that is not such a row (custom blocks) counts as content.
 */
export function hasShownRows(children: ReactNode, row: unknown): boolean {
  return Children.toArray(children).some((child) => {
    if (!isValidElement(child) || child.type !== row) return true;
    const value = (child.props as { value?: unknown }).value;
    return value !== null && value !== undefined && value !== "";
  });
}
