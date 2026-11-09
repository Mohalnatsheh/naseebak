import NextLink from "next/link";
import type { CountryCode } from "@/lib/countries";
import { localizedPath } from "@/lib/site-paths";

/**
 * The sign-up consent line. Its links follow the country chosen in the form (the account's country), not
 * the site the visitor came from: the terms and privacy differ per country (e.g. how codes are sent).
 */
export function TermsConsentText({ country }: { country: CountryCode }) {
  // Inline links: vertical padding widens the tap area to 44 px without moving the line (QA WA-09)
  const linkClass = "py-3 font-semibold text-primary underline underline-offset-2";
  return (
    <span className="text-xs leading-relaxed text-foreground/80">
      أوافق على{" "}
      <NextLink href={localizedPath("/terms", country)} target="_blank" className={linkClass}>
        الشروط والأحكام
      </NextLink>{" "}
      و
      <NextLink href={localizedPath("/privacy", country)} target="_blank" className={linkClass}>
        سياسة الخصوصية
      </NextLink>
      ، وأؤكد أن عمري 18 سنة أو أكثر.
    </span>
  );
}
