import { cn } from "@/lib/utils";

/**
 * Money typography (web-pay P2): a large price in fixed-width digits, the currency smaller and muted after it, and the
 * dollar amount actually charged as a muted line under it. One look for the credit packs and the Pro plans.
 */
const SIZE = {
  lg: "text-display font-black",
  md: "text-title",
  sm: "text-headline",
} as const;

export function MoneyAmount({
  amount,
  symbol,
  size = "lg",
  className,
}: {
  amount: number | string;
  symbol: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span data-slot="money" className={cn("inline-flex items-baseline gap-1.5 tabular-nums", className)}>
      <span data-slot="money-amount" className={cn(SIZE[size], "text-ink")}>
        {amount}
      </span>
      <span data-slot="money-currency" className="text-label text-muted-ink">
        {symbol}
      </span>
    </span>
  );
}

/** «يُخصم 8.46$ بالدولار»: Jordan's prices are shown in dinars and charged in dollars */
export function UsdLine({ usd, lead = "يُخصم", className }: { usd: number; lead?: string; className?: string }) {
  return (
    <p data-slot="usd-line" className={cn("text-caption tabular-nums text-muted-ink", className)}>
      {lead} {usd.toFixed(2)}$ بالدولار
    </p>
  );
}
