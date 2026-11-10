/**
 * The brand sheet as hex, for the few places that can't read the CSS tokens in `globals.css`: Stripe's appearance and
 * hosted-checkout branding, inline SVG data URLs, canvas drawing and the register confetti. Same values as the
 * `@theme` tokens and the app's `AppColors` (design review P1-1). Db-free: safe for client components.
 * Anywhere else, use the Tailwind tokens (`bg-primary`, `text-accent-ink`, `bg-sand`, …), never a raw colour.
 */
export const BRAND_HEX = {
  primary: "#22476a",
  primaryDeep: "#15304a",
  primary2: "#2b5a84",
  accent: "#c19250",
  accentInk: "#7a5420",
  sand: "#f4f1eb",
  ink: "#1a2230",
  mutedInk: "#5b646f",
  line: "#e3e8ee",
  white: "#ffffff",
} as const;
