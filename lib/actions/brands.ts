"use server";
import { db } from "@/lib/db";
import { brands, clients, modelCatalog, promoItems, type ProductOfInterest } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireManager } from "./_shared";

export interface BrandRow {
  id: string;
  name: string;
  /** Models in the catalog with this brand. */
  catalogCount: number;
  /** Promos with this brand. */
  promoCount: number;
  /** Clients with a product of interest of this brand. */
  clientCount: number;
}

const MAX_NAME = 60;
const lower = (s: string) => s.toLowerCase();

function usage(name: string) {
  const n = lower(name);
  const catalogCount = db.select({ c: sql<number>`count(*)` }).from(modelCatalog).where(sql`lower(${modelCatalog.brand}) = ${n}`).get()?.c ?? 0;
  const promoCount = db.select({ c: sql<number>`count(*)` }).from(promoItems).where(sql`lower(${promoItems.brand}) = ${n}`).get()?.c ?? 0;
  const clientCount = db
    .select({ c: sql<number>`count(*)` })
    .from(clients)
    .where(sql`EXISTS (SELECT 1 FROM json_each(${clients.productsOfInterest}) j WHERE lower(json_extract(j.value, '$.brand')) = ${n})`)
    .get()?.c ?? 0;
  return { catalogCount, promoCount, clientCount };
}

/** The brand list with how many catalog models, promos and clients use each brand. */
export async function listBrands(): Promise<BrandRow[]> {
  await requireManager();
  return db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .orderBy(sql`lower(${brands.name})`)
    .all()
    .map((b) => ({ ...b, ...usage(b.name) }));
}

function revalidateBrandPages() {
  revalidatePath("/", "layout");
}

function clash(name: string, exceptId?: string) {
  return db
    .select({ id: brands.id })
    .from(brands)
    .where(exceptId
      ? sql`lower(${brands.name}) = ${lower(name)} AND ${brands.id} != ${exceptId}`
      : sql`lower(${brands.name}) = ${lower(name)}`)
    .get();
}

export async function createBrand(rawName: string): Promise<{ error: string } | undefined> {
  await requireManager();
  const name = rawName.trim();
  if (!name) return { error: "Brand name is required" };
  if (name.length > MAX_NAME) return { error: `Brand name must be ${MAX_NAME} characters or fewer` };
  if (clash(name)) return { error: "A brand with this name already exists" };
  db.insert(brands).values({ id: randomUUID(), name }).run();
  revalidateBrandPages();
}

/**
 * Rename a brand everywhere it's used — catalog models, promos and every
 * client's products of interest — in one transaction.
 */
export async function renameBrand(id: string, rawName: string): Promise<{ error: string } | undefined> {
  await requireManager();
  const next = rawName.trim();
  if (!next) return { error: "Brand name is required" };
  if (next.length > MAX_NAME) return { error: `Brand name must be ${MAX_NAME} characters or fewer` };
  const brand = db.select({ name: brands.name }).from(brands).where(eq(brands.id, id)).get();
  if (!brand) return { error: "Brand not found" };
  if (brand.name === next) return;
  // A brand may change its own capitals ("vellamy" → "Vellamy").
  if (clash(next, id)) return { error: "A brand with this name already exists" };
  const prev = lower(brand.name);
  try {
    db.transaction((tx) => {
      tx.update(modelCatalog).set({ brand: next }).where(sql`lower(${modelCatalog.brand}) = ${prev}`).run();
      tx.update(promoItems).set({ brand: next }).where(sql`lower(${promoItems.brand}) = ${prev}`).run();
      const affected = tx
        .select({ id: clients.id, poi: clients.productsOfInterest })
        .from(clients)
        .where(sql`EXISTS (SELECT 1 FROM json_each(${clients.productsOfInterest}) j WHERE lower(json_extract(j.value, '$.brand')) = ${prev})`)
        .all();
      for (const c of affected) {
        const poi: ProductOfInterest[] = (c.poi ?? []).map((p) => (p.brand && lower(p.brand) === prev ? { ...p, brand: next } : p));
        tx.update(clients).set({ productsOfInterest: poi, updatedAt: new Date() }).where(eq(clients.id, c.id)).run();
      }
      tx.update(brands).set({ name: next }).where(eq(brands.id, id)).run();
    });
    revalidateBrandPages();
  } catch (err) {
    console.error("renameBrand failed:", err);
    return { error: "Failed to rename brand" };
  }
}

/** Remove a brand. Refused while any catalog model, promo or client still uses it. */
export async function deleteBrand(id: string): Promise<{ error: string } | undefined> {
  await requireManager();
  const brand = db.select({ name: brands.name }).from(brands).where(eq(brands.id, id)).get();
  if (!brand) return { error: "Brand not found" };
  const u = usage(brand.name);
  const parts = [
    u.catalogCount && `${u.catalogCount} catalog ${u.catalogCount === 1 ? "model" : "models"}`,
    u.promoCount && `${u.promoCount} ${u.promoCount === 1 ? "promo" : "promos"}`,
    u.clientCount && `${u.clientCount} ${u.clientCount === 1 ? "client" : "clients"}`,
  ].filter(Boolean);
  if (parts.length) {
    return { error: `${brand.name} is still used by ${parts.join(", ")}. Change those first, or rename the brand instead.` };
  }
  db.delete(brands).where(eq(brands.id, id)).run();
  revalidateBrandPages();
}
