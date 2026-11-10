import { COUNTRIES, type CountryCode } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * A country's flag: Jordan as the small drawn flag the site always used. Saudi Arabia as a plain green
 * badge with the white sword line and NO Shahada text (its official flag carries the Shahada, whose
 * graphic/commercial use is restricted; the 🇸🇦 emoji shows as the letters "SA" on Windows). Lebanon as a small
 * drawn flag too (red, white, red with a green cedar), since its 🇱🇧 emoji also shows as letters on Windows.
 */
export function CountryFlag({ country, className }: { country: CountryCode; className?: string }) {
  if (country === "JO") {
    return (
      <svg viewBox="0 0 22 16" className={cn("shrink-0 rounded-sm shadow-sm", className)} role="img" aria-label="علم الأردن">
        <rect width="22" height="5.33" fill="#000" />
        <rect y="5.33" width="22" height="5.33" fill="#fff" />
        <rect y="10.66" width="22" height="5.34" fill="#007A3D" />
        <polygon points="0,0 10,8 0,16" fill="#CE1126" />
        <polygon points="3.6,6.4 4.2,8 3,7 4.4,7 3.2,8" fill="#fff" transform="scale(0.7) translate(1.5,5)" />
      </svg>
    );
  }
  if (country === "LB") {
    return (
      <svg viewBox="0 0 22 16" className={cn("shrink-0 rounded-sm shadow-sm", className)} role="img" aria-label="علم لبنان">
        <rect width="22" height="16" fill="#ED1C24" />
        <rect y="4" width="22" height="8" fill="#fff" />
        <polygon points="11,4.6 14.2,11.2 7.8,11.2" fill="#00A651" />
        <rect x="10.5" y="11" width="1" height="0.9" fill="#00A651" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 22 16" className={cn("shrink-0 rounded-sm shadow-sm", className)} role="img" aria-label={COUNTRIES[country].name}>
      <rect width="22" height="16" fill="#006C35" />
      <path d="M5 11.2h11.5l1.2-.9" stroke="#fff" strokeWidth="1" strokeLinecap="round" fill="none" />
    </svg>
  );
}
