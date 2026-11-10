import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Colour rules (design review P2-4 / DS-18), built into the variants so pages stop choosing colours:
 * - `default`: navy fill: the one main action on light backgrounds.
 * - `gold`: gold fill, ONLY on navy surfaces (hero bands, the login panel, navy cards).
 * - `neutral`: white with a border and ink text: the quiet second choice («لا», «لاحقاً»).
 * - `destructive`: red, only for actions that delete or end something.
 * Size `cta` is the 48 px main button (full width where it closes a form).
 */
const buttonVariants = cva(
  "press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/60 focus-visible:ring-[3px] focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary-deep",
        gold: "bg-accent text-primary-deep font-bold hover:bg-accent/90",
        neutral: "border border-border bg-card text-ink hover:bg-muted",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // On touch screens every size reaches the 44px minimum tap target (min-height wins over
      // height), while mouse layouts keep the compact sizes.
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 pointer-coarse:min-h-11",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3 pointer-coarse:min-h-11",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 pointer-coarse:min-h-11",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4 pointer-coarse:min-h-11",
        cta: "h-12 rounded-xl px-6 text-base font-bold has-[>svg]:px-5",
        icon: "size-9 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        "icon-sm": "size-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        "icon-lg": "size-10 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
