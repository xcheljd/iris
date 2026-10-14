"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Follow-ups needing action now (overdue + due today), scoped server-side like
// the Follow-Ups page. Refetched on every client-side navigation so completing
// one and moving on updates the badge.
export function useFollowUpCount(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    fetch("/api/follow-ups/count")
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => setCount(d.count ?? 0))
      .catch(() => {});
  }, [pathname]);
  return count;
}

export const formatCount = (n: number) => (n > 99 ? "99+" : String(n));
