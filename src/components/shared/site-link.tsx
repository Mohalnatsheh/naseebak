"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useSitePath } from "@/components/shared/visitor-country";

/**
 * Drop-in `next/link` for public pages: a link to a page that exists per country keeps the visitor
 * in their country's URLs ("/faq" → "/sa/faq" on the Saudi site), so search engines crawl each
 * country separately. Every other link is passed through unchanged.
 */
export default function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const sitePath = useSitePath();
  return <NextLink href={typeof href === "string" ? sitePath(href) : href} {...props} />;
}
