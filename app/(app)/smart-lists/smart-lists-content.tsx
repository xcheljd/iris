"use client";

import { useState, useMemo, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeatBadge } from "@/components/heat-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { PaginationFooter } from "@/components/pagination-footer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ListFilter, 
  Plus, 
  Users, 
  Flame, 
  Clock,
  Calendar,
  Mail,
  Star,
  ChevronRight,
  Trash2,
  Copy,
  Pencil,
  MoreHorizontal,
  Lock,
  Globe,
  Sparkles,
  Filter,
} from "lucide-react";
import Link from "next/link";
import { applyClientFilter } from "@/lib/utils";
import { deleteSmartList, duplicateSmartList, renameSmartList, createSmartList } from "@/lib/actions";
import { toast } from "sonner";
import { Topbar } from "@/components/topbar";
import type { SmartList } from "@/lib/db/schema";
import type { ClientListRow } from "@/lib/queries";

interface SmartListsContentProps {
  lists: SmartList[];
  allClients: ClientListRow[];
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
    case "hot": return "Hot Clients";
    case "stale": return "Stale (90+ days)";
    case "recent_purchases": return "Recent Purchases";
    case "no_outreach_60": return "No Outreach (60d)";
    case "birthdays_month": return "Birthdays This Month";
    case "email_subscribers": return "Email Subscribers";
    default: return filter;
  }
}

function ClientRow({ client }: { client: ClientListRow }) {
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
        <HeatBadge level={client.heatLevel} />
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

type FilterValue = string | number | boolean | string[] | null | undefined;

interface ResolvedList {
  id: string;
  name: string;
  filters: Record<string, FilterValue>;
  sort: string | null;
  isShared: boolean;
  isBuiltIn: boolean;
  _count: number;
  _clients: ClientListRow[];
}

function SmartListItem({
  list,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
}: {
  list: ResolvedList;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (newName: string) => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(list.name);

  const handleRename = () => {
    if (newName.trim() && newName !== list.name) {
      onRename(newName.trim());
    }
    setRenameOpen(false);
  };

  return (
    <>
      <div
        className={`group w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors ${
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
        }`}
      >
        <button className="flex items-center gap-2 min-w-0 flex-1" onClick={onSelect}>
          <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-2 min-w-0">
                  {list.isBuiltIn
                    ? getFilterIcon(list.filters.type as string)
                    : list.isShared
                      ? <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                  <span className="text-sm truncate">{list.name}</span>
                </span>
              </TooltipTrigger>
              {list.name.length > 20 && (
                <TooltipContent side="right">
                  <p>{list.name}</p>
                </TooltipContent>
              )}
            </Tooltip>
        </button>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-xs shrink-0">
            {list._count}
          </Badge>
          {!list.isBuiltIn && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="List actions"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setNewName(list.name); setRenameOpen(true); }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename List</DialogTitle>
            <DialogDescription>Enter a new name for this list.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRename()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateListDialog({ open, onOpenChange, allClients }: { open: boolean; onOpenChange: (open: boolean) => void; allClients: ClientListRow[] }) {
  const [name, setName] = useState("");
  const [heatLevel, setHeatLevel] = useState<string>("__none__");
  const [source, setSource] = useState<string>("__none__");
  const [onEmailList, setOnEmailList] = useState(false);
  const [isPending, startTransition] = useTransition();

  const matchingCount = useMemo(() => {
    let filtered = allClients;
    if (heatLevel !== "__none__") filtered = filtered.filter((c) => c.heatLevel === heatLevel);
    if (source !== "__none__") filtered = filtered.filter((c) => c.source === source);
    if (onEmailList) filtered = filtered.filter((c) => c.onEmailList);
    return filtered.length;
  }, [allClients, heatLevel, source, onEmailList]);

  const handleCreate = () => {
    if (!name.trim()) return;
    const filters: Record<string, unknown> = {};
    if (heatLevel !== "__none__") filters.heatLevel = heatLevel;
    if (source !== "__none__") filters.source = source;
    if (onEmailList) filters.onEmailList = true;

    startTransition(async () => {
      await createSmartList(name.trim(), filters);
      toast.success("Smart list created");
      setName("");
      setHeatLevel("__none__");
      setSource("__none__");
      setOnEmailList(false);
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Smart List</DialogTitle>
          <DialogDescription>Define filters to automatically populate your list.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="list-name">Name</Label>
            <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP Clients" />
          </div>
          <Separator />
          <div className="space-y-3">
            <p className="text-sm font-medium">Filters</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Heat Level</Label>
                <Select value={heatLevel} onValueChange={setHeatLevel}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Any</SelectItem>
                    <SelectItem value="hot">Hot</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Any</SelectItem>
                    <SelectItem value="Walk-in">Walk-in</SelectItem>
                    <SelectItem value="Client Log">Client Log</SelectItem>
                    <SelectItem value="Customer Report">Customer Report</SelectItem>
                    <SelectItem value="Referral">Referral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="email-list-filter"
                checked={onEmailList}
                onChange={(e) => setOnEmailList(e.target.checked)}
                className="rounded border-slate-600"
              />
              <Label htmlFor="email-list-filter" className="text-sm">On email list only</Label>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {matchingCount} client{matchingCount !== 1 ? "s" : ""} match current filters
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || isPending}>
            {isPending ? "Creating..." : "Create List"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PAGE_SIZE = 20;

export function SmartListsContent({ lists, allClients }: SmartListsContentProps) {
  const [selectedList, setSelectedList] = useState<ResolvedList | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ResolvedList | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

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
        _count: filtered.length,
        _clients: filtered,
      } as ResolvedList;
    });
  }, [allClients]);

  const customLists = useMemo(() => {
    return lists.map((list) => {
      const filters = list.filters as Record<string, FilterValue>;
      let filtered: ClientListRow[] = allClients;

      if (filters.heatLevel) {
        filtered = filtered.filter((c) => c.heatLevel === String(filters.heatLevel));
      }
      if (filters.tags) {
        const tagsArr = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
        filtered = filtered.filter((c) => tagsArr.some((t) => c.tags?.includes(String(t))));
      }
      if (filters.tag) {
        filtered = filtered.filter((c) => c.tags?.includes(String(filters.tag)));
      }
      if (filters.source) {
        filtered = filtered.filter((c) => c.source === String(filters.source));
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

      return { ...list, _count: filtered.length, _clients: filtered } as ResolvedList;
    });
  }, [lists, allClients]);

  const activeClients = selectedList?._clients || [];
  const filteredClients = searchQuery
    ? activeClients.filter((c) =>
        `${c.firstName} ${c.lastName || ""} ${c.phone || ""} ${c.email || ""}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : activeClients;

  const clientTotalPages = Math.ceil(filteredClients.length / PAGE_SIZE);
  const pagedClients = filteredClients.slice((clientPage - 1) * PAGE_SIZE, clientPage * PAGE_SIZE);

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      await deleteSmartList(deleteTarget.id);
      toast.success("Smart list deleted");
      if (selectedList?.id === deleteTarget.id) setSelectedList(null);
      setDeleteTarget(null);
    });
  };

  const handleDuplicate = (list: ResolvedList) => {
    startTransition(async () => {
      await duplicateSmartList(list.id);
      toast.success("Smart list duplicated");
    });
  };

  const handleRename = (listId: string, newName: string) => {
    startTransition(async () => {
      await renameSmartList(listId, newName);
      toast.success("Smart list renamed");
    });
  };

  return (
    <>
      <Topbar title="Smart Lists" />
      <div className="flex-1 p-4 md:p-6">
      <div className="mb-6">
        <h1 className="sr-only">Smart Lists</h1>
        <p className="text-muted-foreground mt-1">
          Saved filter combinations for quick access
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* List Sidebar */}
        <div className="space-y-4">
          {/* Built-in Lists */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Built-in Lists
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {builtInLists.map((list) => (
                <SmartListItem
                  key={list.id}
                  list={list}
                  isSelected={selectedList?.id === list.id}
                  onSelect={() => { setSelectedList(list); setClientPage(1); }}
                  onDelete={() => {}}
                  onDuplicate={() => {}}
                  onRename={() => {}}
                />
              ))}
            </CardContent>
          </Card>

          <Separator />

          {/* Custom Lists */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Custom Lists
                </CardTitle>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)} aria-label="Create new list">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Create new list</TooltipContent>
                  </Tooltip>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {customLists.length === 0 ? (
                <div className="text-center py-4">
                  <ListFilter className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No custom lists yet</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    Create one
                  </Button>
                </div>
              ) : (
                customLists.map((list) => (
                  <SmartListItem
                    key={list.id}
                    list={list}
                    isSelected={selectedList?.id === list.id}
                    onSelect={() => { setSelectedList(list); setClientPage(1); }}
                    onDelete={() => setDeleteTarget(list)}
                    onDuplicate={() => handleDuplicate(list)}
                    onRename={(newName) => handleRename(list.id, newName)}
                  />
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
                  {selectedList.isBuiltIn
                    ? getFilterIcon(selectedList.filters.type as string)
                    : <Filter className="h-4 w-4" />
                  }
                  {selectedList.name}
                </CardTitle>
                <CardDescription>
                  {selectedList._count} client{selectedList._count !== 1 ? "s" : ""} match
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
                <SearchInput
                  placeholder="Search within list..."
                  value={searchQuery}
                  onChange={(v) => { setSearchQuery(v); setClientPage(1); }}
                />

                {filteredClients.length === 0 ? (
                  <EmptyState icon={Users} description="No clients match this filter" compact />
                ) : (
                  <div className="space-y-1">
                    {pagedClients.map((client) => (
                      <ClientRow key={client.id} client={client} />
                    ))}
                  </div>
                )}
                <PaginationFooter
                  currentPage={clientPage}
                  totalPages={clientTotalPages}
                  onPageChange={setClientPage}
                  totalItems={filteredClients.length}
                  pageSize={PAGE_SIZE}
                  itemLabel="clients"
                />
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted/50 mb-4">
                  <ListFilter className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-medium">No list selected</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Pick a smart list from the sidebar to view matching clients
                </p>
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Custom List
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Smart List?"
        description={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
        confirmLabel={isPending ? "Deleting..." : "Delete"}
        onConfirm={handleDelete}
        variant="destructive"
        disabled={isPending}
      />

      {/* Create List Dialog */}
      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} allClients={allClients} />
      </div>
    </>
  );
}
