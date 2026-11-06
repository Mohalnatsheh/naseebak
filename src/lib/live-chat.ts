/** Tawk.to live chat (owner request 2026-11-06) */
export const TAWK_SRC = "https://embed.tawk.to/6aedb7d654e0763c2fcf47b0/1k6o9c7pn";

/** No bubble in admin, on the card and payment pages, or over the member chat's message box */
export function isLiveChatOffPath(pathname: string): boolean {
  return ["/admin", "/pay", "/payments", "/dashboard/chats"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Above the phone bars (dashboard tabs, the landing start bar) */
export const TAWK_STYLE = {
  visibility: {
    desktop: { position: "br", xOffset: 20, yOffset: 20 },
    mobile: { position: "br", xOffset: 12, yOffset: 84 },
  },
};
