import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-surface border border-line-strong text-ink hover:bg-surface-3",
        primary: "bg-brand text-brand-on border border-transparent hover:brightness-110",
        zeus: "bg-transparent border border-brand-line text-brand-ink hover:bg-brand-tint",
        ghost: "bg-transparent border border-transparent text-ink-2 hover:bg-surface-3 hover:text-ink",
        danger: "bg-transparent border border-crit text-crit hover:bg-crit-tint",
        link: "bg-transparent border-0 text-brand-ink underline-offset-4 hover:underline px-0",
      },
      size: { default: "h-9 px-3.5 text-[13.5px]", sm: "h-8 px-3 text-xs", lg: "h-11 px-5 text-sm", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, type, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} type={asChild ? undefined : type || "button"} {...props} />;
});
Button.displayName = "Button";
export { buttonVariants };
