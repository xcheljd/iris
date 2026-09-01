import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/80",
        outline: "text-foreground",
        hot: "border-transparent bg-orange-500/20 text-orange-400",
        warm: "border-transparent bg-amber-500/20 text-amber-400",
        cold: "border-transparent bg-blue-500/20 text-blue-300",
        gold: "border-transparent bg-meridian-gold/20 text-meridian-gold",
        emerald: "border-transparent bg-emerald-500/20 text-emerald-400",
        rose: "border-transparent bg-rose-500/20 text-rose-400",
        purple: "border-transparent bg-purple-500/20 text-purple-400",
        cyan: "border-transparent bg-cyan-500/20 text-cyan-400",
        blue: "border-transparent bg-blue-500/20 text-blue-400",
        pink: "border-transparent bg-pink-500/20 text-pink-400",
        amber: "border-transparent bg-amber-500/20 text-amber-400",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
