"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PaginationFooter } from "@/components/pagination-footer";
import { EmptyState } from "@/components/empty-state";
import { Filter, Users, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ColumnHeader } from "@/components/column-header";
import { brandLabel } from "@/lib/brand";
import { MatchedClientsCsvExportDialog } from "@/components/matched-clients-csv-export-dialog";
import type { MatchedClientRow } from "@/lib/queries";
import { MoneyCell, MonoCell, StatusBadgeCell, TextCell } from "@/components/data-table/cells";

const PAGE_SIZE = 15;

type SortKey =
  | "client" | "owner" | "preferredContact" | "phone" | "email"
  | "promoModel" | "promoCollection" | "promoBrand" | "msrp" | "discountPrice" | "matchType";

interface Props {
  clients: MatchedClientRow[];
  isManager: boolean;
  currentUserId: string;
}

const fullName = (r: MatchedClientRow) => `${r.clientFirstName} ${r.clientLastName ?? ""}`.trim();

export function MatchedClientsTab({ clients, isManager, currentUserId }: Props) {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [ownerFilter, setOwnerFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [brandFilter, setBrandFilter] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };
  const toggleIn = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    setter(next);
    setPage(1);
  };

  const owners = useMemo(
    () => Array.from(new Set(clients.map((c) => c.ownerName).filter((o): o is string => !!o))).sort(),
    [clients],
  );
  const brands = useMemo(
    () => Array.from(new Set(clients.map((c) => c.promoBrand).filter((b): b is string => !!b))).sort(),
    [clients],
  );

  const rows = useMemo(() => {
    let r = clients;
    if (ownerFilter.size) r = r.filter((c) => c.ownerName && ownerFilter.has(c.ownerName));
    if (typeFilter.size) r = r.filter((c) => typeFilter.has(c.matchType));
    if (brandFilter.size) r = r.filter((c) => c.promoBrand && brandFilter.has(c.promoBrand));
    if (sortKey) {
      const val = (c: MatchedClientRow): string | number => {
        switch (sortKey) {
          case "client": return fullName(c).toLowerCase();
          case "owner": return (c.ownerName ?? "").toLowerCase();
          case "preferredContact": return c.preferredContact ?? "";
          case "phone": return c.phone ?? "";
          case "email": return (c.email ?? "").toLowerCase();
          case "promoModel": return c.promoModel.toLowerCase();
          case "promoCollection": return c.promoCollection.toLowerCase();
          case "promoBrand": return c.promoBrand ?? "";
          case "msrp": return c.msrp ?? -Infinity;
          case "discountPrice": return c.discountPrice ?? -Infinity;
          case "matchType": return c.matchType;
        }
      };
      r = [...r].sort((a, b) => {
        const av = val(a), bv = val(b);
        const dir = sortDir === "asc" ? 1 : -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return r;
  }, [clients, ownerFilter, typeFilter, brandFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const paged = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const Facet = ({ label, values, set, setter }: { label: string; values: string[]; set: Set<string>; setter: (s: Set<string>) => void }) => (
    <div>
      <div className="text-xs font-medium mb-1">{label}</div>
      <div className="flex flex-col max-h-32 overflow-y-auto gap-1">
        {values.length === 0 && <div className="text-xs text-muted-foreground">none</div>}
        {values.map((v) => (
          <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <Checkbox checked={set.has(v)} onCheckedChange={() => toggleIn(set, v, setter)} />
            {label === "Brand" ? brandLabel(v) : v}
          </label>
        ))}
      </div>
    </div>
  );

  const filtersActive = ownerFilter.size || typeFilter.size || brandFilter.size;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Matched Clients
          </CardTitle>
          <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Download className="size-4 mr-1.5" />
            Export CSV
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className={`size-4 mr-1.5 ${filtersActive ? "text-primary" : ""}`} />
                Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent className="flex flex-col w-64 gap-3" align="end">
              <Facet label="Assigned associate" values={owners} set={ownerFilter} setter={setOwnerFilter} />
              <Facet label="Match type" values={["model", "collection", "brand"]} set={typeFilter} setter={setTypeFilter} />
              <Facet label="Brand" values={brands} set={brandFilter} setter={setBrandFilter} />
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => { setOwnerFilter(new Set()); setTypeFilter(new Set()); setBrandFilter(new Set()); setPage(1); }}
              >
                Clear filters
              </Button>
            </PopoverContent>
          </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No matched clients" compact />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><ColumnHeader label="Client" sortKey="client" currentSort={sortKey ?? undefined} currentDir={sortDir} onSortAction={toggleSort} /></TableHead>
                  <TableHead><ColumnHeader label="Associate" sortKey="owner" currentSort={sortKey ?? undefined} currentDir={sortDir} onSortAction={toggleSort} /></TableHead>
                  <TableHead className="hidden md:table-cell"><ColumnHeader label="Pref. contact" sortKey="preferredContact" currentSort={sortKey ?? undefined} currentDir={sortDir} onSortAction={toggleSort} /></TableHead>
                  <TableHead className="hidden sm:table-cell"><ColumnHeader label="Phone" sortKey="phone" currentSort={sortKey ?? undefined} currentDir={sortDir} onSortAction={toggleSort} /></TableHead>
                  <TableHead className="hidden lg:table-cell"><ColumnHeader label="Email" sortKey="email" currentSort={sortKey ?? undefined} currentDir={sortDir} onSortAction={toggleSort} /></TableHead>
                  <TableHead><ColumnHeader label="Model" sortKey="promoModel" currentSort={sortKey ?? undefined} currentDir={sortDir} onSortAction={toggleSort} /></TableHead>
                  <TableHead className="hidden sm:table-cell"><ColumnHeader label="Collection" sortKey="promoCollection" currentSort={sortKey ?? undefined} currentDir={sortDir} onSortAction={toggleSort} /></TableHead>
                  <TableHead className="hidden sm:table-cell"><ColumnHeader label="Brand" sortKey="promoBrand" currentSort={sortKey ?? undefined} currentDir={sortDir} onSortAction={toggleSort} /></TableHead>
                  <TableHead className="hidden md:table-cell text-right"><ColumnHeader align="right" label="MSRP" sortKey="msrp" currentSort={sortKey ?? undefined} currentDir={sortDir} onSortAction={toggleSort} /></TableHead>
                  <TableHead className="hidden md:table-cell text-right"><ColumnHeader align="right" label="Sale" sortKey="discountPrice" currentSort={sortKey ?? undefined} currentDir={sortDir} onSortAction={toggleSort} /></TableHead>
                  <TableHead><ColumnHeader label="Match" sortKey="matchType" currentSort={sortKey ?? undefined} currentDir={sortDir} onSortAction={toggleSort} /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((c, i) => {
                  const canLink = isManager || c.clientEmployeeId === currentUserId;
                  return (
                    <TableRow key={`${c.clientId}|${c.promoModel}|${c.matchType}|${i}`}>
                      <TableCell className="font-medium">
                        {canLink ? (
                          <Link href={`/clients/${c.clientId}?from=promo-matches`} className="hover:underline">
                            {fullName(c)}
                          </Link>
                        ) : fullName(c)}
                      </TableCell>
                      <TableCell>{c.ownerName ?? "Unassigned"}</TableCell>
                      <TextCell value={c.preferredContact} className="hidden md:table-cell capitalize" />
                      <TextCell value={c.phone} className="hidden sm:table-cell" />
                      <TextCell value={c.email} className="hidden lg:table-cell" />
                      <MonoCell value={c.promoModel} />
                      <TableCell className="hidden sm:table-cell">{c.promoCollection}</TableCell>
                      <TableCell className="hidden sm:table-cell">{brandLabel(c.promoBrand)}</TableCell>
                      <MoneyCell value={c.msrp} className="hidden md:table-cell" />
                      <MoneyCell value={c.discountPrice} emphasis="sale" className="hidden md:table-cell" />
                      <StatusBadgeCell label={c.matchType} variant={c.matchType === "model" ? "default" : "secondary"} />
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <PaginationFooter
              currentPage={current}
              totalPages={totalPages}
              onPageChangeAction={setPage}
              totalItems={rows.length}
              pageSize={PAGE_SIZE}
              variant="icons"
              showBorder
            />
          </div>
        )}
      </CardContent>
      <MatchedClientsCsvExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        owners={[...ownerFilter]}
        matchTypes={[...typeFilter]}
        brands={[...brandFilter]}
      />
    </Card>
  );
}
