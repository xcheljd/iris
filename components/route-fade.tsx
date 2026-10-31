"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Keyed by pathname (not searchParams) so filter/pagination clicks on the
// same route don't remount and re-trigger the fade. The wrapper must preserve
// SidebarInset's flex column chain (pages rely on flex-1 to fill the viewport)
// and min-h-0 so inner overflow panes can shrink.
export function RouteFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className="flex flex-1 flex-col min-h-0 animate-in fade-in duration-200 motion-reduce:animate-none"
    >
      {children}
    </div>
  );
}
