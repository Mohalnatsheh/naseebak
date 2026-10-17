import type { Metadata } from "next";
import { notFound } from "next/navigation";

// The (ar)/not-found.tsx metadata doesn't reach the tab for unknown addresses, so name it here
export const metadata: Metadata = { title: "الصفحة غير موجودة", robots: { index: false } };

// Unknown addresses render the branded Arabic 404 in (ar)/not-found.tsx
export default function CatchAllNotFound() {
  notFound();
}
