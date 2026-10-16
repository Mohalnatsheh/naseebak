import type { Prisma } from "@prisma/client";

/**
 * Match a person by name or phone for admin list filters. Phones are stored as 962XXXXXXXXX,
 * so a local "07…" search also tries the 962 form. Returns null for an empty query.
 */
export function personSearch(q: string | null | undefined): Prisma.UserWhereInput | null {
  const text = q?.trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  const phones = digits.length >= 4 ? [digits, digits.startsWith("0") ? `962${digits.slice(1)}` : digits] : [];
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
