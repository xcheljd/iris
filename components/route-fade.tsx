"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Keyed by pathname (not searchParams) so filter/pagination clicks on the
// same route don't remount and re-trigger the fade.
export function RouteFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-in fade-in duration-200 motion-reduce:animate-none">
      {children}
    </div>
  );
}
