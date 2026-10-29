/** Cities and districts per country (db-free; used by the profile wizards). */
import { jordanAreas } from "@/lib/data/jordan-areas";
import { saudiAreas } from "@/lib/data/saudi-areas";
import { toCountry, type CountryCode } from "@/lib/countries";

const AREAS: Record<CountryCode, Record<string, string[]>> = { JO: jordanAreas, SA: saudiAreas };

export function areasFor(country: unknown): Record<string, string[]> {
  return AREAS[toCountry(country)];
}

export function citiesFor(country: unknown): string[] {
  return Object.keys(areasFor(country));
}
