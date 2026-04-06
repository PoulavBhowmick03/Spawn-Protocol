"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border bg-clip-padding font-mono text-xs uppercase tracking-widest whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[#00ff88] text-black border-transparent hover:bg-[#00dd77]",
        outline:
          "border-[#00ff88]/60 text-[#00ff88] bg-transparent hover:bg-[#00ff88]/10 hover:border-[#00ff88]",
        secondary:
          "bg-[#1a1a2e] text-[#f5f5f0] border-white/[0.08] hover:bg-white/[0.08]",
        ghost:
          "text-[#4a4f5e] border-transparent bg-transparent hover:text-[#f5f5f0] hover:bg-white/[0.05]",
        destructive:
          "bg-[#ff3b3b] text-white border-transparent hover:bg-[#dd2222]",
        link: "text-[#00ff88] underline-offset-4 hover:underline border-transparent bg-transparent",
      },
      size: {
        default: "h-8 gap-1.5 px-3",
        xs: "h-6 gap-1 px-2 text-[10px]",
        sm: "h-7 gap-1 px-2.5",
        lg: "h-9 gap-1.5 px-4",
        icon: "size-8",
        "icon-xs": "size-6",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
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
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
