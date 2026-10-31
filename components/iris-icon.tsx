"use client";

import React, { useId } from "react";
import { BRAND, MARK, centreOn } from "@/lib/brand-mark";
import { cn } from "@/lib/utils";

/**
 * The Iris logo: a gold wing breaking out through a ring (see
 * `lib/brand-mark.ts`). Drawn without a tile, for the app's own navy and
 * cream surfaces; the app icons put it on a gold tile.
 *
 * `variant="flat"` draws it in one bronze tone, for light backgrounds where
 * the pale gold feather would fade. The default, `"auto"`, follows the theme:
 * gold in dark mode, bronze in light mode.
 */
type IrisIconProps = { size?: number; variant?: "auto" | "gold" | "flat" } & React.SVGProps<SVGSVGElement>;

export function IrisIcon({ variant = "auto", className, ...props }: IrisIconProps) {
  if (variant !== "auto") return <IrisMark variant={variant} className={className} {...props} />;
  return (
    <>
      <IrisMark variant="flat" className={cn(className, "dark:hidden")} {...props} />
      <IrisMark variant="gold" className={cn(className, "hidden dark:block")} {...props} />
    </>
  );
}

function IrisMark({
  size = 64,
  variant,
  className,
  ...props
}: { size?: number; variant: "gold" | "flat" } & React.SVGProps<SVGSVGElement>) {
  // Unique gradient ids, so several logos on one page don't share defs.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const flat = variant === "flat";
  const fill = (name: string) => (flat ? BRAND.bronzeDeep : `url(#${id}-${name})`);

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Iris"
      className={className}
      {...props}
    >
      {!flat && (
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={BRAND.gold} />
            <stop offset="100%" stopColor={BRAND.goldDeep} />
          </linearGradient>
          <linearGradient id={`${id}-l`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={BRAND.goldLight} />
            <stop offset="100%" stopColor={BRAND.goldLightDeep} />
          </linearGradient>
          <linearGradient id={`${id}-d`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={BRAND.bronze} />
            <stop offset="100%" stopColor={BRAND.bronzeDeep} />
          </linearGradient>
        </defs>
      )}
      <g transform={centreOn(MARK.center, 0.92)}>
        <path d={MARK.ring} stroke={fill("g")} strokeWidth={30} strokeLinecap="round" fill="none" />
        <path d={MARK.feathers[0]} fill={fill("l")} />
        <path d={MARK.feathers[1]} fill={fill("g")} />
        <path d={MARK.feathers[2]} fill={fill("d")} />
        <circle cx={MARK.pivot.cx} cy={MARK.pivot.cy} r={MARK.pivot.r} fill={fill("d")} />
      </g>
    </svg>
  );
}
