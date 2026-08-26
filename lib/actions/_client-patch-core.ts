// Raw client-patch DB logic, deliberately NOT a "use server" module — it takes
// an already-validated patch and performs no auth. The only caller is
// saveClientEdits in ./clients.ts, which owns the auth + zod allowlist.
import { db } from "@/lib/db";
import { clients, activityEvents, type ProductOfInterest } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { recordProductsOfInterest } from "./model-catalog";

export function applyClientPatchUnchecked(clientId: string, data: Record<string, unknown>, employeeId: string): void {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) patch[k] = v;
  }
  db.update(clients).set(patch).where(eq(clients.id, clientId)).run();
  if (data.productsOfInterest !== undefined) {
    recordProductsOfInterest(db, data.productsOfInterest as ProductOfInterest[]);
  }
  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId,
    eventType: "edited",
    description: "Profile updated",
    metadata: { fieldChanges: data },
    employeeId,
  }).run();
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}
