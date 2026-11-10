import type { Prisma } from "@prisma/client";
import { toLatinDigits } from "@/lib/digits";

/**
 * Match a person by name or phone for admin list filters. Phones are stored with the dial code,
 * so a local "07…" / "05…" search also tries the 962 / 966 form. Returns null for an empty query.
 */
export function personSearch(q: string | null | undefined): Prisma.UserWhereInput | null {
  const text = q?.trim();
  if (!text) return null;
  // Arabic-Indic digits from an Arabic keyboard count too (ADM-15)
  const digits = toLatinDigits(text).replace(/\D/g, "");
  const phones = digits.length >= 4 ? [digits, digits.startsWith("0") ? `${digits.startsWith("05") ? "966" : "962"}${digits.slice(1)}` : digits] : [];
  return {
    OR: [
      ...text.split(/\s+/).flatMap((word) => [
        { firstName: { contains: word, mode: "insensitive" as const } },
        { lastName: { contains: word, mode: "insensitive" as const } },
      ]),
      ...phones.map((p) => ({ phone: { contains: p } })),
    ],
  };
}
