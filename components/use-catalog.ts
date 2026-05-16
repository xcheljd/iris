"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Fetches the model→collection catalog map (+ the viewer's manager flag)
 * for product-of-interest autofill. Hybrid delivery: load on mount and
 * `refetch()` after a catalog correction so open forms pick up the new
 * value without a full reload.
 */
export function useCatalog() {
  const [map, setMap] = useState<Record<string, string>>({});
  const [isManager, setIsManager] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/catalog");
      if (!res.ok) return;
      const data = (await res.json()) as { map: Record<string, string>; isManager: boolean };
      setMap(data.map ?? {});
      setIsManager(!!data.isManager);
    } catch {
      // Non-fatal: autofill simply won't suggest until a successful fetch.
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { catalogMap: map, isManager, refetchCatalog: refetch };
}
