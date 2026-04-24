"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  ListFilter, 
  Plus, 
  Search, 
  Users, 
  Flame, 
  Snowflake, 
  Clock,
  Calendar,
  Mail,
  Star,
  ChevronRight,
  Trash2,
  Share2,
  Lock,
  Globe
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { applyClientFilter } from "@/lib/utils";
import type { Client } from "@/lib/db/schema";
import type { SmartList } from "@/lib/db/schema";

interface SmartListsContentProps {
  lists: SmartList[];
  allClients: Client[];
}

function getFilterIcon(filter: string) {
  switch (filter) {
    case "hot": return <Flame className="h-4 w-4 text-orange-500" />;
    case "stale": return <Clock className="h-4 w-4 text-yellow-500" />;
    case "recent_purchases": return <Star className="h-4 w-4 text-emerald-500" />;
    case "no_outreach_60": return <Clock className="h-4 w-4 text-red-500" />;
    case "birthdays_month": return <Calendar className="h-4 w-4 text-pink-500" />;
    case "email_subscribers": return <Mail className="h-4 w-4 text-blue-500" />;
    default: return <ListFilter className="h-4 w-4" />;
  }
}

function getFilterLabel(filter: string) {
  switch (filter) {
    case "hot": return "🔥 Hot Clients";
    case "stale": return "⏰ Stale (90+ days)";
    case "recent_purchases": return "⭐ Recent Purchases";
    case "no_outreach_60": return "📵 No Outreach (60d)";
    case "birthdays_month": return "🎂 Birthdays This Month";
    case "email_subscribers": return "📧 Email Subscribers";
    default: return filter;
  }
}

function getHeatBadge(level: string) {
  switch (level) {
    case "hot": return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-xs">Hot</Badge>;
    case "warm": return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-xs">Warm</Badge>;
    case "cold": return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">Cold</Badge>;
    default: return null;
  }
}

function ClientRow({ client }: { client: Client }) {
  return (
    <Link
      href={`/clients/${client.id}`}
      className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">
            {client.firstName} {client.lastName || ""}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {client.phone && <span>{client.phone}</span>}
            {client.email && <span className="truncate">{client.email}</span>}
          </div>
        </div>
        {getHeatBadge(client.heatLevel)}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

export function SmartListsContent({ lists, allClients }: SmartListsContentProps) {
  const [selectedList, setSelectedList] = useState<SmartList | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Compute built-in smart lists
  const builtInLists = useMemo(() => {
    const filters = ["hot", "stale", "recent_purchases", "no_outreach_60", "birthdays_month", "email_subscribers"];
    return filters.map((filter) => {
      const filtered = applyClientFilter(allClients, filter);
      return {
        id: `builtin-${filter}`,
        name: getFilterLabel(filter),
        filters: { type: filter },
        sort: null,
        isShared: true,
        isBuiltIn: true,
        createdAt: new Date(),
        _count: filtered.length,
        _clients: filtered,
      };
    });
  }, [allClients]);

  // Custom lists with computed counts
  const customLists = useMemo(() => {
    return lists.map((list) => {
      const filters = list.filters as Record<string, any>;
      let filtered = allClients;
      
      if (filters.heatLevel) {
        filtered = filtered.filter((c) => c.heatLevel === filters.heatLevel);
      }
      if (filters.tags) {
        const tagsArr = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
        filtered = filtered.filter((c) => tagsArr.some((t: string) => c.tags?.includes(t)));
      }
      if (filters.tag) {
        filtered = filtered.filter((c) => c.tags?.includes(filters.tag));
      }
      if (filters.source) {
        filtered = filtered.filter((c) => c.source === filters.source);
      }
      if (filters.onEmailList) {
        filtered = filtered.filter((c) => c.onEmailList);
      }
      if (filters.stale) {
        const now = Date.now();
        filtered = filtered.filter((c) => {
          if (c.status !== "active") return false;
          const last = Math.max(
            c.lastOutreachAt ? new Date(c.lastOutreachAt).getTime() : 0,
            c.lastPurchaseAt ? new Date(c.lastPurchaseAt).getTime() : 0,
          );
          return !c.lastOutreachAt && !c.lastPurchaseAt ? true : (now - last) > 90 * 86400000;
        });
      }
      if (filters.birthdayMonth) {
        const month = filters.birthdayMonth as number;
        filtered = filtered.filter((c) => {
          if (!c.birthday) return false;
          const m = parseInt(c.birthday.split("-")[1] || "0", 10);
          return m === month;
        });
      }
      
      return { ...list, _count: filtered.length, _clients: filtered };
    });
  }, [lists, allClients]);

  const activeClients = selectedList
    ? (selectedList as any)._clients || []
    : [];

  const filteredClients = searchQuery
    ? activeClients.filter((c) =>
        `${c.firstName} ${c.lastName || ""} ${c.phone || ""} ${c.email || ""}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : activeClients;

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Smart Lists</h1>
        <p className="text-muted-foreground mt-1">
          Saved filter combinations for quick access
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
        {/* List Sidebar */}
        <div className="space-y-4">
          {/* Built-in Lists */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ListFilter className="h-4 w-4" />
                Built-in Lists
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {builtInLists.map((list) => (
                <button
                  key={list.id}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors ${
                    selectedList?.id === list.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedList(list as any)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {getFilterIcon((list.filters as any).type)}
                    <span className="text-sm truncate">{list.name}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {list._count}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Custom Lists */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Custom Lists
                </CardTitle>
                <Button size="sm" variant="ghost">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {customLists.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">
                  No custom lists yet
                </p>
              ) : (
                customLists.map((list) => (
                  <button
                    key={list.id}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors ${
                      selectedList?.id === list.id
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedList(list as any)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {list.isShared ? (
                        <Globe className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm truncate">{list.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {list._count}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Client List */}
        <Card>
          <CardHeader>
            {selectedList ? (
              <>
                <CardTitle className="flex items-center gap-2">
                  {getFilterIcon((selectedList.filters as any)?.type || "custom")}
                  {selectedList.name}
                </CardTitle>
                <CardDescription>
                  {(selectedList as any)._count} client{(selectedList as any)._count !== 1 ? "s" : ""} match
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle>Select a List</CardTitle>
                <CardDescription>
                  Choose a smart list from the sidebar to view matching clients
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {selectedList ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search within list..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {filteredClients.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No clients match this filter</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-1">
                      {filteredClients.map((client) => (
                        <ClientRow key={client.id} client={client} />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <ListFilter className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">No list selected</p>
                <p className="text-sm mt-1">
                  Pick a smart list from the sidebar to get started
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}