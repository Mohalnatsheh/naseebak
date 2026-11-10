/** Tawk.to live chat (owner request 2026-11-06) */
export const TAWK_SRC = "https://embed.tawk.to/6aedb7d654e0763c2fcf47b0/1k6o9c7pn";

/**
 * No bubble in admin, on the card and payment pages, over the member chat's message box, or on the credits and Pro
 * pages, whose footer links it covered on phones (QA WP2-15)
 */
export function isLiveChatOffPath(pathname: string): boolean {
  return ["/admin", "/pay", "/payments", "/dashboard/chats", "/dashboard/payments", "/dashboard/pro"].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** Pages where the bubble is off on phones only: it sat over the zero-credit banner and the card's top-up link (owner, 2026-11-10) */
const PHONE_OFF_PATHS = ["/dashboard/suggestions"];

/** Hidden here: an off page at any width, or a phone-only off page below the phone layout's width */
export function isLiveChatHidden(pathname: string, viewportWidth: number): boolean {
  if (isLiveChatOffPath(pathname)) return true;
  return viewportWidth < 768 && PHONE_OFF_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Tawk reads this once, at load. Phones sit above the bottom bars: 64px + the iPhone home-indicator area (up to 34px) */
export function tawkStyle(viewportWidth: number) {
  const above = { position: "br", xOffset: 12, yOffset: 104 };
  return {
    visibility: {
      // A narrow desktop window gets Tawk's desktop style, but the site's phone layout
      desktop: viewportWidth < 768 ? above : { position: "br", xOffset: 20, yOffset: 20 },
      mobile: above,
    },
  };
}

/**
 * Tawk can't move its bubble after load: a window loaded wide (bubble 20px from the bottom) and then
 * narrowed to the phone layout would cover the bottom bar («الرئيسية»), so the bubble hides until the
 * window is wide again (QA WC-08). A window loaded narrow already sits above the bars at every width.
 */
export function bubbleMisplaced(loadedWidth: number, viewportWidth: number): boolean {
  return loadedWidth >= 768 && viewportWidth < 768;
}
