import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest leading-none whitespace-nowrap transition-all [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-[#00ff88] text-black border-transparent",
        secondary: "bg-[#1a1a2e] text-[#f5f5f0] border-white/[0.08]",
        destructive: "bg-[#ff3b3b] text-white border-transparent",
        outline: "border-white/[0.08] text-[#f5f5f0] bg-transparent",
        ghost: "text-[#4a4f5e] border-transparent bg-transparent",
        link: "text-[#00ff88] underline-offset-4 hover:underline border-transparent bg-transparent",
        /* Tactical status variants */
        aligned: "bg-[#00ff88] text-black border-transparent",
        drifting: "bg-[#f5a623] text-black border-transparent",
        misaligned: "bg-[#ff3b3b] text-white border-transparent",
        terminated: "bg-[#4a4f5e]/40 text-[#4a4f5e] border-white/[0.08]",
        pending: "border-[#4a4f5e] text-[#4a4f5e] bg-transparent",
        active: "border-[#00ff88]/40 text-[#00ff88] bg-[#00ff88]/10",
        warning: "bg-[#f5a623] text-black border-transparent",
        info: "border-white/[0.08] text-[#f5f5f0] bg-white/[0.05]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
