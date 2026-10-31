"use client";

import { createContext, useContext } from "react";

const BrandsContext = createContext<readonly string[]>([]);

/** Makes the store's brand list (Settings → Brands) available to every page. */
export function BrandsProvider({ brands, children }: { brands: readonly string[]; children: React.ReactNode }) {
  return <BrandsContext.Provider value={brands}>{children}</BrandsContext.Provider>;
}

/** The store's brand names, alphabetical. */
export function useBrands(): readonly string[] {
  return useContext(BrandsContext);
}
