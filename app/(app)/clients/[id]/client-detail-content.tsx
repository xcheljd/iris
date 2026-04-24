"use client";

import { ClientDetailTabs } from "@/components/client-detail-tabs";
import { ClientSidebar } from "@/components/client-sidebar";
import { ClientProvider } from "@/components/client-provider";

export function ClientDetailContent({ client }: { client: any }) {
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <ClientProvider client={client}>
        <div className="w-[280px] flex-shrink-0 border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <ClientSidebar />
        </div>
        <div className="flex-1 overflow-auto">
          <ClientDetailTabs />
        </div>
      </ClientProvider>
    </div>
  );
}