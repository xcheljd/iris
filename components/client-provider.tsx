"use client";

import { createContext, useContext, ReactNode, useState } from "react";
import type { OutreachLog, ActivityEvent, PromoMatch, PromoWatch, ClientTag } from "@/lib/db/schema";

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
  productsOfInterest: string[];
  notes?: string | null;
  onEmailList: boolean;
  status: "active" | "inactive" | "banned" | "unsubscribed";
  source: "Client Log" | "Customer Report" | "Walk-in" | "Referral";
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
const ActiveTabContext = createContext<{ activeTab: string; setActiveTab: (tab: string) => void }>({ activeTab: "profile", setActiveTab: () => {} });

export function ClientProvider({ client, children }: { client: FullClient; children: ReactNode }) {
  const [activeTab, setActiveTab] = useState("profile");
  return (
    <ClientContext.Provider value={client}>
      <ActiveTabContext.Provider value={{ activeTab, setActiveTab }}>
        {children}
      </ActiveTabContext.Provider>
    </ClientContext.Provider>
  );
}

export function useClient() {
  return useContext(ClientContext);
}

export function useActiveTab() {
  return useContext(ActiveTabContext);
}