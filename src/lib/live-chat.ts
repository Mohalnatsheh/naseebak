/** Tawk.to live chat (owner request 2026-11-06) */
export const TAWK_SRC = "https://embed.tawk.to/6aedb7d654e0763c2fcf47b0/1k6o9c7pn";

/** No bubble in admin, on the card and payment pages, or over the member chat's message box */
export function isLiveChatOffPath(pathname: string): boolean {
  return ["/admin", "/pay", "/payments", "/dashboard/chats"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
