/**
 * Small pieces of public-page copy that differ per visitor country (db-free, client-safe):
 * site description, keywords, Open Graph locale, schema.org area, footer lines.
 * JO = the original Jordanian text (live site, unchanged); SA = the reviewed Saudi copy (naseebak-ksa);
 * LB = Jordan's text with Lebanon named (neutral for every community).
 */
import type { CountryCode } from "@/lib/countries";

export interface PublicCopy {
  /** Site description (meta + Open Graph) */
  description: string;
  /** Same without the closing phrase (Twitter card, Organization JSON-LD) */
  shortDescription: string;
  /** Tagline: site title, login page */
  tagline: string;
  keywords: string[];
  ogLocale: "ar_JO" | "ar_SA" | "ar_LB";
  /** schema.org Organization.areaServed */
  areaServed: { "@type": "Country"; name: string; identifier?: string };
  /** «في الأردن» / «في المملكة العربية السعودية» in page descriptions */
  inCountry: string;
  /** Footer: about line, address line, "made in" line */
  footerAbout: string;
  footerPlace: string;
  footerMadeIn: string;
  /** The country's Instagram account: footer icon and Organization JSON-LD ("" = none yet, hidden) */
  instagram: string;
}

const JO: PublicCopy = {
  description: "منصة أردنية توصّل العائلات بالشريك الأنسب بالحلال — تقنية ذكية مع عادات أردنية أصيلة، بستر واحترام",
  shortDescription: "منصة أردنية توصّل العائلات بالشريك الأنسب بالحلال — تقنية ذكية مع عادات أردنية أصيلة",
  tagline: "نوصّلك بشريك العمر بالحلال",
  keywords: ["زواج", "زواج بالحلال", "نصيبك", "زواج أردني", "تعارف للزواج", "شريك الحياة", "زواج إسلامي", "خطبة", "الأردن"],
  ogLocale: "ar_JO",
  instagram: "https://www.instagram.com/naseebakjo/",
  areaServed: { "@type": "Country", name: "Jordan" },
  inCountry: "في الأردن",
  footerAbout: "منصة أردنية توصّل العائلات بالشريك الأنسب بالحلال — تقنية ذكية مع عادات أردنية أصيلة، بستر واحترام.",
  footerPlace: "عمّان، الأردن",
  footerMadeIn: "في الأردن",
};

const SA: PublicCopy = {
  description: "منصة سعودية تعين العائلات على إيجاد الشريك الأنسب بالحلال — توافق ذكي يحترم عاداتنا وقيمنا، بستر واحترام",
  shortDescription: "منصة سعودية تعين العائلات على إيجاد الشريك الأنسب بالحلال — توافق ذكي يحترم عاداتنا وقيمنا",
  tagline: "نعينك على إيجاد شريك العمر بالحلال",
  keywords: [
    "زواج",
    "زواج بالحلال",
    "نصيبك",
    "زواج سعودي",
    "خطابة",
    "خاطبة",
    "تعارف للزواج",
    "شريك الحياة",
    "زواج إسلامي",
    "خطبة",
    "السعودية",
    "الرياض",
    "جدة",
  ],
  ogLocale: "ar_SA",
  instagram: "https://www.instagram.com/naseebaksa",
  areaServed: { "@type": "Country", name: "Saudi Arabia", identifier: "SA" },
  inCountry: "في المملكة العربية السعودية",
  footerAbout: "منصة سعودية تعين العائلات على إيجاد الشريك الأنسب بالحلال — توافق ذكي يحترم عاداتنا وقيمنا، بستر واحترام.",
  footerPlace: "المملكة العربية السعودية",
  footerMadeIn: "لعائلات المملكة",
};

const LB: PublicCopy = {
  description: "منصة توصّل العائلات في لبنان بالشريك الأنسب بالحلال — تقنية ذكية تحترم عاداتنا وقيمنا، بستر واحترام",
  shortDescription: "منصة توصّل العائلات في لبنان بالشريك الأنسب بالحلال — تقنية ذكية تحترم عاداتنا وقيمنا",
  tagline: "نوصّلك بشريك العمر بالحلال",
  keywords: ["زواج", "زواج بالحلال", "نصيبك", "زواج في لبنان", "تعارف للزواج", "شريك الحياة", "زواج إسلامي", "خطبة", "لبنان"],
  ogLocale: "ar_LB",
  // No Lebanese account yet: empty hides the footer icon and the JSON-LD link (never Jordan's account)
  instagram: "",
  areaServed: { "@type": "Country", name: "Lebanon", identifier: "LB" },
  inCountry: "في لبنان",
  footerAbout: "منصة توصّل العائلات في لبنان بالشريك الأنسب بالحلال — تقنية ذكية تحترم عاداتنا وقيمنا، بستر واحترام.",
  footerPlace: "لبنان",
  footerMadeIn: "لعائلات لبنان",
};

const COPY: Record<CountryCode, PublicCopy> = { JO, SA, LB };

export function publicCopy(country: CountryCode): PublicCopy {
  return COPY[country] ?? JO;
}
