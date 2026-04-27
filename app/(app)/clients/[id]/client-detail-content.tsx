"use client";

import { ClientDetailTabs } from "@/components/client-detail-tabs";
import { ClientSidebar } from "@/components/client-sidebar";
import { ClientProvider } from "@/components/client-provider";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Topbar } from "@/components/topbar";
import type { FullClient } from "@/components/client-provider";

export function ClientDetailContent({ client }: { client: FullClient }) {
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
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        <ClientProvider client={client}>
          <div className="md:w-[280px] md:flex-shrink-0 md:border-r md:overflow-y-auto border-b md:border-b-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <ClientSidebar />
          </div>
          <div className="flex-1 overflow-auto">
            <ClientDetailTabs />
          </div>
        </ClientProvider>
      </div>
    </div>
  );
}