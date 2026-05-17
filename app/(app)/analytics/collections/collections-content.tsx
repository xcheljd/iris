"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeatBadge } from "@/components/heat-badge";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Watch,
  BarChart3
} from "lucide-react";
import { Topbar } from "@/components/topbar";
import Link from "next/link";
import { PaginationFooter } from "@/components/pagination-footer";
import type { ClientListRow } from "@/lib/queries";

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

interface CollectionsContentProps {
  clients: ClientListRow[];
}

export function CollectionsContent({ clients }: CollectionsContentProps) {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  // Honor ?collection= so the client-detail breadcrumb round-trips back
  // to this page with the collection pre-selected.
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    searchParams.get("collection"),
  );
  const [clientsPage, setClientsPage] = useState(1);

  // Extract all collections from client products of interest
  const collectionData = useMemo(() => {
    const totals: Record<string, number> = {};
    
    clients.forEach((client) => {
      const poi = client.productsOfInterest || [];
      poi.forEach((product) => {
        if (product.collection) {
          totals[product.collection] = (totals[product.collection] || 0) + 1;
        }
      });
    });

    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [clients]);

  const totalInterests = collectionData.reduce((sum, c) => sum + c.count, 0);

  // Filter collections by search
  const filteredCollections = searchQuery
    ? collectionData.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : collectionData;

  // Get clients interested in selected collection
  const collectionClients = useMemo(() => {
    if (!selectedCollection) return [];
    return clients.filter((client) => {
      const poi = client.productsOfInterest || [];
      return poi.some((p) => p.collection === selectedCollection);
    });
  }, [clients, selectedCollection]);

  const clientsTotalPages = Math.ceil(collectionClients.length / PAGE_SIZE);
  const pagedClients = collectionClients.slice((clientsPage - 1) * PAGE_SIZE, clientsPage * PAGE_SIZE);

  return (
    <>
      <Topbar title="Collections" />
      <div className="flex-1 p-4 md:p-6">
      <div className="mb-6">
        <h1 className="sr-only">Collections</h1>
        <p className="text-muted-foreground mt-1">
          Track client interest across watch collections
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_350px] gap-6">
        {/* Collection List */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Watch className="h-5 w-5" />
                Collection Interest
              </CardTitle>
              <CardDescription>
                {collectionData.length} collections tracked across {totalInterests} interests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SearchInput
                placeholder="Search collections..."
                value={searchQuery}
                onChange={setSearchQuery}
                className="mb-4"
              />

              {filteredCollections.length === 0 ? (
                <EmptyState icon={Watch} description="No collections found" compact />
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {filteredCollections.map((collection) => (
                      <button
                        key={collection.name}
                        className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                          selectedCollection === collection.name
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => {
                          setSelectedCollection(
                            selectedCollection === collection.name ? null : collection.name
                          );
                          setClientsPage(1);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <Watch className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{collection.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{collection.count}</Badge>
                          {totalInterests > 0 && (
                            <span className="text-xs text-muted-foreground w-10 text-right">
                              {Math.round((collection.count / totalInterests) * 100)}%
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Selected Collection Details */}
        <div className="space-y-4">
          {selectedCollection ? (
            <>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Collection</p>
                      <p className="text-xl font-bold">{selectedCollection}</p>
                    </div>
                    <Watch className="h-10 w-10 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">
                    Interested Clients ({collectionClients.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {collectionClients.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No clients interested
                      </p>
                    ) : (
                      pagedClients.map((client) => (
                        <Link
                          key={client.id}
                          href={`/clients/${client.id}?from=collections&collection=${encodeURIComponent(selectedCollection ?? "")}`}
                          className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {client.firstName} {client.lastName || ""}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {client.phone || client.email || "No contact"}
                            </p>
                          </div>
                          <HeatBadge level={client.heatLevel} />
                        </Link>
                      ))
                    )}
                  </div>
                  <PaginationFooter
                    currentPage={clientsPage}
                    totalPages={clientsTotalPages}
                    onPageChange={setClientsPage}
                    totalItems={collectionClients.length}
                    pageSize={PAGE_SIZE}
                    itemLabel="clients"
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-lg font-medium">Select a collection</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click a collection to see interested clients
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      </div>
    </>
  );
}