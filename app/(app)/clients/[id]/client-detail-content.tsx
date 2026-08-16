"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClientDetailTabs } from "@/components/client-detail-tabs";
import { ClientSidebar } from "@/components/client-sidebar";
import { ClientProvider } from "@/components/client-provider";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Topbar } from "@/components/topbar";
import { ChevronDown } from "lucide-react";
import type { FullClient } from "@/components/client-provider";

export function ClientDetailContent({ client, currentUserRole }: { client: FullClient; currentUserRole?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchParams = useSearchParams();
  // When arrived from the Collections analytics page, show
  // "Collections > [collection] > [client]" instead of "Clients > [client]".
  const fromCollection =
    searchParams.get("from") === "collections" ? searchParams.get("collection") : null;
  const fromPromoMatches = searchParams.get("from") === "promo-matches";

  return (
    <div className="flex flex-col h-svh">
      <Topbar title={`${client.firstName} ${client.lastName}`} />
      <div className="px-4 pt-3">
        <Breadcrumb>
          <BreadcrumbList>
            {fromCollection ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/analytics/collections">Collections</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href={`/analytics/collections?collection=${encodeURIComponent(fromCollection)}`}>
                    {fromCollection}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            ) : fromPromoMatches ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/promos">Promo Manager</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/promos?tab=matched">Matched Clients</BreadcrumbLink>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbLink href="/clients">Clients</BreadcrumbLink>
              </BreadcrumbItem>
            )}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{client.firstName} {client.lastName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <ClientProvider client={client}>
        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          {/* Mobile: collapsible sidebar */}
          <div className="md:hidden">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium border-b bg-muted/30 hover:bg-muted/50 transition-colors"
              aria-expanded={sidebarOpen}
              aria-controls="mobile-sidebar"
            >
              <span>Client Info &amp; Actions</span>
              <ChevronDown className={`size-4 transition-transform ${sidebarOpen ? "rotate-180" : ""}`} />
            </button>
            <div
              id="mobile-sidebar"
              className={`overflow-hidden transition-all duration-200 ${sidebarOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}
            >
               <ClientSidebar />
             </div>
           </div>

           {/* Desktop: persistent sidebar */}
           <div className="hidden md:block md:w-[280px] md:flex-shrink-0 md:border-r md:overflow-y-auto bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
             <ClientSidebar />
          </div>

          <div className="flex-1 overflow-auto">
            <ClientDetailTabs currentUserRole={currentUserRole} />
          </div>
        </div>
      </ClientProvider>
    </div>
  );
}