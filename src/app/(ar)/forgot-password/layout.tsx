import type { Metadata } from "next";

/** A step page with no content of its own: kept out of search results */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function NoIndexLayout({ children }: { children: React.ReactNode }) {
  return children;
}
