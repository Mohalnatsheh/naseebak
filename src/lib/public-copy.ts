/**
 * Small pieces of public-page copy that differ per visitor country (db-free, client-safe):
 * site description, keywords, Open Graph locale, schema.org area, footer lines.
 * JO = the original Jordanian text (live site, unchanged); SA = the reviewed Saudi copy (naseebak-ksa).
 */
import type { CountryCode } from "@/lib/countries";

export interface PublicCopy {
  /** Site description (meta + Open Graph) */
  description: string;
  /** Same without the closing phrase (Twitter card, Organization JSON-LD) */
  shortDescription: string;
  keywords: string[];
  ogLocale: "ar_JO" | "ar_SA";
  /** schema.org Organization.areaServed */
  areaServed: { "@type": "Country"; name: string; identifier?: string };
  /** «في الأردن» / «في المملكة العربية السعودية» in page descriptions */
  inCountry: string;
  /** Footer: about line, address line, "made in" line */
  footerAbout: string;
  footerPlace: string;
  footerMadeIn: string;
}

const JO: PublicCopy = {
  description: "منصة أردنية توصّل العائلات بالشريك الأنسب بالحلال — تقنية ذكية مع عادات أردنية أصيلة، بسترة واحترام",
  shortDescription: "منصة أردنية توصّل العائلات بالشريك الأنسب بالحلال — تقنية ذكية مع عادات أردنية أصيلة",
  keywords: ["زواج", "زواج بالحلال", "نصيبك", "زواج أردني", "تعارف للزواج", "شريك الحياة", "زواج إسلامي", "خطبة", "الأردن"],
  ogLocale: "ar_JO",
  areaServed: { "@type": "Country", name: "Jordan" },
  inCountry: "في الأردن",
  footerAbout: "منصة أردنية توصّل العائلات بالشريك الأنسب بالحلال — تقنية ذكية مع عادات أردنية أصيلة، بسترة واحترام.",
  footerPlace: "عمّان، الأردن",
  footerMadeIn: "في الأردن",
};

const SA: PublicCopy = {
  description: "منصة سعودية تعين العائلات على إيجاد الشريك الأنسب بالحلال — توافق ذكي يحترم عاداتنا وقيمنا، بستر واحترام",
  shortDescription: "منصة سعودية تعين العائلات على إيجاد الشريك الأنسب بالحلال — توافق ذكي يحترم عاداتنا وقيمنا",
  keywords: [
    "زواج",
    "زواج بالحلال",
    "نصيبك",
    "زواج سعودي",
    "خطّابة",
    "تعارف للزواج",
    "شريك الحياة",
    "زواج إسلامي",
    "خطبة",
    "السعودية",
    "الرياض",
    "جدة",
  ],
  ogLocale: "ar_SA",
  areaServed: { "@type": "Country", name: "Saudi Arabia", identifier: "SA" },
  inCountry: "في المملكة العربية السعودية",
  footerAbout: "منصة سعودية تعين العائلات على إيجاد الشريك الأنسب بالحلال — توافق ذكي يحترم عاداتنا وقيمنا، بستر واحترام.",
  footerPlace: "المملكة العربية السعودية",
  footerMadeIn: "لعائلات المملكة",
};

const COPY: Record<CountryCode, PublicCopy> = { JO, SA };

export function publicCopy(country: CountryCode): PublicCopy {
  return COPY[country] ?? JO;
}
