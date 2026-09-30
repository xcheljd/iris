import type { FullClient } from "@/components/client-provider";

/**
 * The onboarding tour's example client. It is rendered from this in-memory
 * object by the client detail page and never written to the database: a real
 * row with one fixed id belonged to whoever toured first (so everyone else hit
 * notFound), and it leaked into lists, exports, analytics and — being on the
 * email list — email recipients.
 */
export const TOUR_DEMO_CLIENT_ID = "__tour_demo__";

export function tourDemoClient(viewer: { id: string; name?: string | null }): FullClient {
  const now = new Date().toISOString();
  return {
    id: TOUR_DEMO_CLIENT_ID,
    firstName: "Alex",
    lastName: "Tourguide",
    phone: "(555) 000-0000",
    email: "alex.tourguide@example.com",
    employeeId: viewer.id,
    employeeName: viewer.name ?? null,
    customerId: null,
    dateAdded: now,
    productsOfInterest: [
      { model: "IX1002-01X", collection: "CAMBRIDGE", brand: "Meridian", intent: "promo" },
      { model: "LX1024-01X", collection: "LUNARIS", brand: null, intent: "interested" },
    ],
    notes: "This is an example client profile used by the onboarding tour.",
    onEmailList: false,
    preferredContact: "email",
    status: "active",
    source: "Walk-in",
    birthday: "1990-06-15",
    anniversary: null,
    tags: ["VIP", "repeat-buyer"],
    heatScore: 75,
    heatLevel: "hot",
    lastOutreachAt: null,
    lastPurchaseAt: null,
    createdAt: now,
    updatedAt: now,
    outreach: [],
    timeline: [],
    matches: [],
    allTags: [],
    followUps: [],
  };
}
