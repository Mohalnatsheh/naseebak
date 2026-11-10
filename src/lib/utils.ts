import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge taught the design tokens (globals.css `@theme`): `text-caption` … `text-display` are font sizes, not
 * colours, so `cn("text-caption", "text-accent-foreground")` keeps both; `shadow-float` / `rounded-card` merge as
 * shadows and radii.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "display-sm", "title", "headline", "body", "label", "caption"] }],
      shadow: [{ shadow: ["float", "dialog"] }],
      rounded: [{ rounded: ["card", "sheet"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parsePagination(searchParams: URLSearchParams, defaultSize = 10) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  return { page, pageSize: defaultSize, skip: (page - 1) * defaultSize };
}

/**
 * Arabic count with the right noun form: 1 → "حقل واحد", 2 → "حقلان",
 * 3–10 → "3 حقول", 11+ → "11 حقلاً".
 */
export function arabicCount(n: number, forms: { one: string; two: string; few: string; many: string }) {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const mod = n % 100;
  if (mod >= 3 && mod <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}
