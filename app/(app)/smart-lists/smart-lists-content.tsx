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
import { Checkbox } from "@/components/ui/checkbox";
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
import { useRouter } from "next/navigation";
import { deleteSmartList, duplicateSmartList, renameSmartList, createSmartList } from "@/lib/actions";
import { toast } from "sonner";
import { Topbar } from "@/components/topbar";
import type { SmartList } from "@/lib/db/schema";
import { CLIENT_SOURCE_VALUES } from "@/lib/db/schema";
import type { ClientListRow } from "@/lib/queries";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

interface SmartListsContentProps {
  lists: SmartList[];
  counts: { builtIn: Record<string, number>; custom: Record<string, number> };
  selectedListId: string | null;
  selectedClients: ClientListRow[] | null;
}

const BUILTIN_FILTERS = [
  { id: "hot", label: "Hot Clients", icon: <Flame className="h-4 w-4 text-orange-500" /> },
  { id: "stale", label: "Stale (90+ days)", icon: <Clock className="h-4 w-4 text-yellow-500" /> },
  { id: "recent_purchases", label: "Recent Purchases", icon: <Star className="h-4 w-4 text-emerald-500" /> },
  { id: "no_outreach_60", label: "No Outreach (60d)", icon: <Clock className="h-4 w-4 text-red-500" /> },
  { id: "birthdays_month", label: "Birthdays This Month", icon: <Calendar className="h-4 w-4 text-pink-500" /> },
  { id: "email_subscribers", label: "Email Subscribers", icon: <Mail className="h-4 w-4 text-blue-500" /> },
] as const;

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

function SmartListItem({
  id: _id,
  name,
  icon,
  count,
  isBuiltIn,
  isShared,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
}: {
  id: string;
  name: string;
  icon: React.ReactNode;
  count: number;
  isBuiltIn: boolean;
  isShared: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(name);

  const handleRename = () => {
    if (newName.trim() && newName !== name) onRename(newName.trim());
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
                {isBuiltIn ? icon : isShared
                  ? <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                }
                <span className="text-sm truncate">{name}</span>
              </span>
            </TooltipTrigger>
            {name.length > 20 && (
              <TooltipContent side="right"><p>{name}</p></TooltipContent>
            )}
          </Tooltip>
        </button>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-xs shrink-0">{count}</Badge>
          {!isBuiltIn && (
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
                <DropdownMenuItem onClick={() => { setNewName(name); setRenameOpen(true); }}>
                  <Pencil className="h-4 w-4 mr-2" />Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />Delete
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

function CreateListDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [heatLevel, setHeatLevel] = useState<string>("__none__");
  const [source, setSource] = useState<string>("__none__");
  const [onEmailList, setOnEmailList] = useState(false);
  const [isPending, startTransition] = useTransition();

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
                    {CLIENT_SOURCE_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="email-list-filter"
                checked={onEmailList}
                onCheckedChange={(checked) => setOnEmailList(!!checked)}
              />
              <Label htmlFor="email-list-filter" className="text-sm">On email list only</Label>
            </div>
          </div>
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

export function SmartListsContent({ lists, counts, selectedListId, selectedClients }: SmartListsContentProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<SmartList | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectList = (id: string) => {
    router.replace(`/smart-lists?list=${encodeURIComponent(id)}`);
    setSearchQuery("");
    setClientPage(1);
  };

  const filteredClients = useMemo(() => {
    if (!selectedClients) return [];
    if (!searchQuery) return selectedClients;
    const q = searchQuery.toLowerCase();
    return selectedClients.filter((c) =>
      `${c.firstName} ${c.lastName || ""} ${c.phone || ""} ${c.email || ""}`.toLowerCase().includes(q)
    );
  }, [selectedClients, searchQuery]);

  const totalPages = Math.ceil(filteredClients.length / PAGE_SIZE);
  const pagedClients = filteredClients.slice((clientPage - 1) * PAGE_SIZE, clientPage * PAGE_SIZE);

  const selectedBuiltInFilter = selectedListId?.startsWith("builtin-") ? selectedListId.slice(8) : null;
  const selectedCustomListId = selectedListId && !selectedListId.startsWith("builtin-") ? selectedListId : null;

  const selectedBuiltIn = selectedBuiltInFilter
    ? BUILTIN_FILTERS.find((f) => f.id === selectedBuiltInFilter)
    : null;
  const selectedCustom = selectedCustomListId
    ? lists.find((l) => l.id === selectedCustomListId)
    : null;
  const selectedName = selectedBuiltIn?.label ?? selectedCustom?.name ?? null;
  const selectedCount = selectedBuiltIn
    ? counts.builtIn[selectedBuiltIn.id] ?? 0
    : selectedCustom
      ? counts.custom[selectedCustom.id] ?? 0
      : 0;

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      await deleteSmartList(deleteTarget.id);
      toast.success("Smart list deleted");
      if (selectedListId === deleteTarget.id) router.replace("/smart-lists");
      setDeleteTarget(null);
    });
  };

  const handleDuplicate = (list: SmartList) => {
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
          <p className="text-muted-foreground mt-1">Saved filter combinations for quick access</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          {/* List Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />Built-in Lists
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {BUILTIN_FILTERS.map((f) => (
                  <SmartListItem
                    key={f.id}
                    id={f.id}
                    name={f.label}
                    icon={f.icon}
                    count={counts.builtIn[f.id] ?? 0}
                    isBuiltIn
                    isShared={false}
                    isSelected={selectedListId === `builtin-${f.id}`}
                    onSelect={() => selectList(f.id)}
                    onDelete={() => {}}
                    onDuplicate={() => {}}
                    onRename={() => {}}
                  />
                ))}
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Star className="h-4 w-4" />Custom Lists
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
                {lists.length === 0 ? (
                  <div className="text-center py-4">
                    <ListFilter className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No custom lists yet</p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => setCreateOpen(true)}>
                      <Plus className="h-3 w-3 mr-1" />Create one
                    </Button>
                  </div>
                ) : (
                  lists.map((list) => (
                    <SmartListItem
                      key={list.id}
                      id={list.id}
                      name={list.name}
                      icon={<Filter className="h-4 w-4" />}
                      count={counts.custom[list.id] ?? 0}
                      isBuiltIn={false}
                      isShared={list.isShared}
                      isSelected={selectedListId === list.id}
                      onSelect={() => selectList(list.id)}
                      onDelete={() => setDeleteTarget(list)}
                      onDuplicate={() => handleDuplicate(list)}
                      onRename={(newName) => handleRename(list.id, newName)}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Client List Panel */}
          <Card>
            <CardHeader>
              {selectedName ? (
                <>
                  <CardTitle className="flex items-center gap-2">
                    {selectedBuiltIn?.icon ?? <Filter className="h-4 w-4" />}
                    {selectedName}
                  </CardTitle>
                  <CardDescription>
                    {selectedCount} client{selectedCount !== 1 ? "s" : ""} match
                  </CardDescription>
                </>
              ) : (
                <>
                  <CardTitle>Select a List</CardTitle>
                  <CardDescription>Choose a smart list from the sidebar to view matching clients</CardDescription>
                </>
              )}
            </CardHeader>
            <CardContent>
              {selectedClients !== null ? (
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
                    totalPages={totalPages}
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
                    <Plus className="h-4 w-4 mr-2" />Create Custom List
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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

        <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    </>
  );
}
