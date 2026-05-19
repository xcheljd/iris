"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveInterest } from "@/lib/resolve-interest";
import type { CatalogEntry } from "@/lib/actions/model-catalog";

/**
 * Fetches the catalog for product-of-interest autofill AND client-side
 * derive-at-read. Exposes the legacy model→collection `catalogMap` plus
 * a `resolve(poi)` returning the catalog-authoritative {collection,
 * brand} for a cataloged model (falling back to the POI's stored values
 * for collection/brand-only or uncatalogued interests). Hybrid delivery:
 * load on mount and `refetchCatalog()` after a catalog change so open
 * views pick up new values without a full reload.
 */
export function useCatalog() {
  const [map, setMap] = useState<Record<string, string>>({});
  const [index, setIndex] = useState<Record<string, CatalogEntry> | null>(null);
  const [isManager, setIsManager] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/catalog");
      if (!res.ok) return;
      const data = (await res.json()) as {
        map: Record<string, string>;
        index: Record<string, CatalogEntry>;
        isManager: boolean;
      };
      setMap(data.map ?? {});
      setIndex(data.index ?? {});
      setIsManager(!!data.isManager);
    } catch {
      // Non-fatal: autofill/resolution uses stored values until a
      // successful fetch.
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const indexMap = useMemo(() => new Map(Object.entries(index ?? {})), [index]);

  const resolve = useCallback(
    (poi: { model: string | null; collection: string | null; brand: string | null }) =>
      resolveInterest(poi, indexMap),
    [indexMap],
  );

  return { catalogMap: map, catalogIndex: index, isManager, refetchCatalog: refetch, resolve };
}
