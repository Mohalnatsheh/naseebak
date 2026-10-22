import Image from "next/image";
import { cn } from "@/lib/utils";

/** Real screen captures are 390×844 CSS px at 2× (780×1688) */
const SCREEN_W = 780;
const SCREEN_H = 1688;

/**
 * A slim phone around a real screenshot of the platform (captured from the running app with demo
 * accounts — never a mock-up). Width is set by the parent; the height follows the screen ratio.
 */
export function PhoneFrame({
  src,
  alt,
  priority,
  sizes = "(min-width: 1024px) 320px, 70vw",
  className,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[2.4rem] bg-[oklch(0.20_0.04_252)] p-[7px] shadow-[0_40px_80px_-30px_oklch(0.22_0.05_252/0.6),0_0_0_1px_oklch(1_0_0/0.08)_inset]",
        className
      )}
    >
      <div className="overflow-hidden rounded-[1.95rem] bg-background">
        <Image src={src} alt={alt} width={SCREEN_W} height={SCREEN_H} sizes={sizes} priority={priority} className="h-auto w-full" />
      </div>
    </div>
  );
}
