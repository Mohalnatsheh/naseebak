"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Phones only: once both quick-start forms (and the footer) are off screen, a slim bar keeps «ابدأ مجاناً» in reach.
 * Hidden again whenever a form is visible, so it never covers one.
 */
export function StickyStart() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Both forms and the footer (the bar never covers the footer links)
    const forms = [document.getElementById("start"), document.getElementById("start-final"), document.querySelector("footer")].filter(
      (el): el is HTMLElement => !!el
    );
    if (forms.length === 0 || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<Element, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target, e.isIntersecting);
        const anyVisible = [...visible.values()].some(Boolean);
        // Only after the visitor has scrolled past the hero
        setShow(!anyVisible && window.scrollY > 400);
      },
      { threshold: 0 }
    );
    forms.forEach((f) => io.observe(f));
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-300 md:hidden ${
        show ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
      aria-hidden={!show}
    >
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">التسجيل مجاني، واقتراحاتك الأولى تصلك فوراً</p>
        <Link
          href="/register"
          tabIndex={show ? 0 : -1}
          className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-5 text-base font-extrabold text-accent-foreground"
        >
          ابدأ مجاناً
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
