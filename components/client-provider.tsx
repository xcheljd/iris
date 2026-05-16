"use client";

import { createContext, useContext, ReactNode } from "react";
import type { OutreachLog, ActivityEvent, PromoMatch, PromoWatch, ClientTag, ClientSource, ProductOfInterest } from "@/lib/db/schema";

export interface PromoMatchWithPromo {
  match: PromoMatch;
  promo: PromoWatch | null;
}

export interface FullClient {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  customerId?: string | null;
  dateAdded: string;
  productsOfInterest: ProductOfInterest[];
  notes?: string | null;
  onEmailList: boolean;
  status: "active" | "inactive" | "banned" | "unsubscribed" | "deleted";
  source: ClientSource;
  birthday?: string | null;
  anniversary?: string | null;
  tags: string[];
  heatScore: number;
  heatLevel: "hot" | "warm" | "cold";
  lastOutreachAt?: string | null;
  lastPurchaseAt?: string | null;
  createdAt: string;
  updatedAt: string;
  outreach: OutreachLog[];
  timeline: ActivityEvent[];
  matches: PromoMatchWithPromo[];
  allTags: ClientTag[];
  followUps: OutreachLog[];
}

const ClientContext = createContext<FullClient | null>(null);

export function ClientProvider({ client, children }: { client: FullClient; children: ReactNode }) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient() {
  return useContext(ClientContext);
}
