"use client";

import { usePathname } from "next/navigation";

/** Dashboard footer — hidden inside a chat, which fills the screen height. */
export function DashboardFooter() {
  const pathname = usePathname();
  if (/^\/dashboard\/chats\/[^/]+/.test(pathname)) return null;
  return (
    <footer className="border-t py-4 text-center text-sm text-muted-foreground">
      © {new Date().getFullYear()} نصيبك - جميع الحقوق محفوظة
    </footer>
  );
}
