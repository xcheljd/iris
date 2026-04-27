"use client";

import { useState } from "react";
import { ClientDetailTabs } from "@/components/client-detail-tabs";
import { ClientSidebar } from "@/components/client-sidebar";
import { ClientProvider } from "@/components/client-provider";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Topbar } from "@/components/topbar";
import { ChevronDown } from "lucide-react";
import type { FullClient } from "@/components/client-provider";

export function ClientDetailContent({ client }: { client: FullClient }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <Topbar title={`${client.firstName} ${client.lastName}`} />
      <div className="px-4 pt-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/clients">Clients</BreadcrumbLink>
            </BreadcrumbItem>
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
              <ChevronDown className={`h-4 w-4 transition-transform ${sidebarOpen ? "rotate-180" : ""}`} />
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
            <ClientDetailTabs />
          </div>
        </div>
      </ClientProvider>
    </div>
  );
}