"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { HeatBadge } from "@/components/heat-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Topbar } from "@/components/topbar";
import { formatPhone, daysAgo } from "@/lib/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Search, ChevronUp, ChevronDown, ChevronsUpDown, MoreHorizontal, Eye, Edit, Ban, MailX } from "lucide-react";
import { BanCustomerDialog, UnsubscribeCustomerDialog } from "@/components/client-status-actions";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 20;

type SortKey = "name" | "heat" | "lastContact" | "owner";
type SortDir = "asc" | "desc";

interface ClientRow {
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    heatLevel: "hot" | "warm" | "cold";
    heatScore: number;
    status: string;
    lastOutreachAt: string | null;
    tags: string[];
  };
  employeeName: string | null;
}

function SortableHeader({ label, sortKey, currentSort, currentDir, onSort }: {
  label: string; sortKey: SortKey; currentSort: SortKey; currentDir: SortDir; onSort: (key: SortKey) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button onClick={() => onSort(sortKey)} className="flex items-center gap-1 hover:text-foreground transition-colors">
      {label}
      {isActive ? (
        currentDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  );
}

export function ClientListContent({ rows, totalClients }: { rows: ClientRow[]; totalClients: number }) {
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") || "");
  const [heat, setHeat] = useState(searchParams.get("heat") || "any");
  const [filter, setFilter] = useState(searchParams.get("filter") || "all");
  const [owner, setOwner] = useState(searchParams.get("owner") || "any");
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const owners = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.employeeName) set.add(r.employeeName); });
    return Array.from(set).sort();
  }, [rows]);

  // Filter
  const filtered = useMemo(() => {
    let list = rows;
    if (q) {
      const ql = q.toLowerCase();
      list = list.filter((r) =>
        `${r.client.firstName} ${r.client.lastName ?? ""}`.toLowerCase().includes(ql) ||
        (r.client.email ?? "").toLowerCase().includes(ql) ||
        (r.client.phone ?? "").includes(ql)
      );
    }
    if (heat && heat !== "any") list = list.filter((r) => r.client.heatLevel === heat);
    if (owner && owner !== "any") {
      if (owner === "__none__") list = list.filter((r) => !r.employeeName);
      else list = list.filter((r) => r.employeeName === owner);
    }
    if (filter && filter !== "all") {
      const now = Date.now() / 1000;
      const day = 86400;
      switch (filter) {
        case "hot": list = list.filter((r) => r.client.heatLevel === "hot"); break;
        case "stale": list = list.filter((r) => !r.client.lastOutreachAt || (now - new Date(r.client.lastOutreachAt).getTime() / 1000) > 90 * day); break;
        case "email_subscribers": list = list.filter((r) => r.client.tags?.includes("email-only")); break;
      }
    }
    return list;
  }, [rows, q, heat, owner, filter]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      switch (sort) {
        case "name": return dir * `${a.client.firstName} ${a.client.lastName ?? ""}`.localeCompare(`${b.client.firstName} ${b.client.lastName ?? ""}`);
        case "heat": return dir * (a.client.heatScore - b.client.heatScore);
        case "lastContact": {
          const aT = a.client.lastOutreachAt ? new Date(a.client.lastOutreachAt).getTime() : 0;
          const bT = b.client.lastOutreachAt ? new Date(b.client.lastOutreachAt).getTime() : 0;
          return dir * (aT - bT);
        }
        case "owner": return dir * (a.employeeName ?? "").localeCompare(b.employeeName ?? "");
        default: return 0;
      }
    });
    return copy;
  }, [filtered, sort, sortDir]);

  // Paginate
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const toggleAll = () => {
    if (selected.size === paged.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paged.map((r) => r.client.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  return (
    <>
      <Topbar title="Clients">
        <Button asChild variant="gold" size="sm">
          <Link href="/clients/new"><Plus className="h-4 w-4 mr-1" /> Add Client</Link>
        </Button>
      </Topbar>
      <div className="flex-1 p-4 md:p-6 space-y-4">
        {/* Filters */}
        <Card className="p-3">
          <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, email, phone…" className="pl-8" />
            </div>
            <Select value={heat} onValueChange={(v) => { setHeat(v); setPage(1); }}>
              <SelectTrigger className="md:w-40"><SelectValue placeholder="Heat" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any heat</SelectItem>
                <SelectItem value="hot">Hot</SelectItem>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="cold">Cold</SelectItem>
              </SelectContent>
            </Select>
            <Select value={owner} onValueChange={(v) => { setOwner(v); setPage(1); }}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any owner</SelectItem>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {owners.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); }}>
              <SelectTrigger className="md:w-48"><SelectValue placeholder="Filter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                <SelectItem value="hot">Hot only</SelectItem>
                <SelectItem value="stale">Stale (90+ days)</SelectItem>
                <SelectItem value="email_subscribers">Email subscribers</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{selected.size} selected</span>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        {/* Table */}
        <Card>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Select all</span>
                  <Checkbox
                    checked={paged.length > 0 && selected.size === paged.length}
                    onCheckedChange={toggleAll}
                    aria-label="Select all clients"
                  />
                </TableHead>
                <TableHead><SortableHeader label="Name" sortKey="name" currentSort={sort} currentDir={sortDir} onSort={handleSort} /></TableHead>
                <TableHead>Contact</TableHead>
                <TableHead><SortableHeader label="Heat" sortKey="heat" currentSort={sort} currentDir={sortDir} onSort={handleSort} /></TableHead>
                <TableHead className="hidden md:table-cell">Tags</TableHead>
                <TableHead className="hidden md:table-cell"><SortableHeader label="Owner" sortKey="owner" currentSort={sort} currentDir={sortDir} onSort={handleSort} /></TableHead>
                <TableHead className="hidden md:table-cell"><SortableHeader label="Last contact" sortKey="lastContact" currentSort={sort} currentDir={sortDir} onSort={handleSort} /></TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No clients match.</TableCell>
                </TableRow>
              ) : paged.map((r) => {
                const d = daysAgo(r.client.lastOutreachAt);
                const isSelected = selected.has(r.client.id);
                return (
                  <TableRow key={r.client.id} className={isSelected ? "bg-accent/5" : "hover:bg-muted/30"}>
                    <TableCell>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(r.client.id)} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/clients/${r.client.id}`} className="font-medium hover:underline">
                        {r.client.firstName} {r.client.lastName ?? ""}
                      </Link>
                      {r.client.status !== "active" && <Badge variant="outline" className="ml-2 text-[10px] capitalize">{r.client.status}</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">{formatPhone(r.client.phone)}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{r.client.email}</div>
                    </TableCell>
                    <TableCell><HeatBadge level={r.client.heatLevel} score={r.client.heatScore} showScore /></TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex gap-1 flex-wrap max-w-[180px]">
                        {(r.client.tags || []).slice(0, 3).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{r.employeeName ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{d === null ? "Never" : d === 0 ? "Today" : `${d}d ago`}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/clients/${r.client.id}`}><Eye className="h-4 w-4 mr-2" /> View</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/clients/${r.client.id}/edit`}><Edit className="h-4 w-4 mr-2" /> Edit</Link>
                          </DropdownMenuItem>
                          {r.client.status === "active" && (
                            <>
                              <DropdownMenuSeparator />
                              <BanCustomerDialog clientId={r.client.id} clientName={`${r.client.firstName} ${r.client.lastName ?? ""}`}>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={(e) => e.preventDefault()}
                                >
                                  <Ban className="h-4 w-4 mr-2" /> Ban Customer
                                </DropdownMenuItem>
                              </BanCustomerDialog>
                              <UnsubscribeCustomerDialog clientId={r.client.id} clientName={`${r.client.firstName} ${r.client.lastName ?? ""}`}>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={(e) => e.preventDefault()}
                                >
                                  <MailX className="h-4 w-4 mr-2" /> Unsubscribe
                                </DropdownMenuItem>
                              </UnsubscribeCustomerDialog>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </Card>

        {/* Footer: count + pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{filtered.length} of {totalClients} clients</p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
