"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { MatchedClientsCsvExportDialog } from "@/components/matched-clients-csv-export-dialog";
import { Filter, Users, Download, AlertTriangle, Phone, Mail, MessageSquare } from "lucide-react";
import { PAGE_READ_LIMIT } from "@/lib/constants";
import { brandLabel } from "@/lib/brand";
import { formatMoney } from "@/lib/utils";
import { isPromoUpcoming, promoDiscount } from "@/lib/promo-active";
import { format, parseISO } from "date-fns";
import type { MatchedClientRow } from "@/lib/queries";

const PAGE_SIZE = 15;
const MATCH_TYPES = ["model", "collection"] as const;

/**
 * Matched Clients: one row per client, their matched items underneath.
 *
 * The server sends one row per client per item (the CSV keeps that shape);
 * here they are grouped by client. Filters and search apply to items, so a
 * client shows when any of their items is left, with just those items.
 * Rows start closed; the chevron (or Expand all) shows the items, lined up
 * under the same columns.
 */

interface Props {
  clients: MatchedClientRow[];
  /** True when the server cut the match list at PAGE_READ_LIMIT. */
  truncated?: boolean;
  isManager: boolean;
  currentUserId: string;
}

interface ClientGroup {
  clientId: string;
  name: string;
  employeeId: string | null;
  ownerName: string | null;
  preferredContact: string | null;
  phone: string | null;
  email: string | null;
  items: MatchedClientRow[];
  /** The item with the biggest discount (the row's "best deal"). */
  best: MatchedClientRow;
  bestPercent: number;
}

const fullName = (r: MatchedClientRow) => `${r.clientFirstName} ${r.clientLastName ?? ""}`.trim();
const percentOf = (r: MatchedClientRow) => Math.round(promoDiscount(r));

function group(rows: MatchedClientRow[]): ClientGroup[] {
  const byId = new Map<string, MatchedClientRow[]>();
  for (const r of rows) byId.set(r.clientId, [...(byId.get(r.clientId) ?? []), r]);
  return [...byId.values()].map((unsorted) => {
    // Biggest discount first, so the best pitch is on top when a client is opened.
    const items = [...unsorted].sort((a, b) => promoDiscount(b) - promoDiscount(a) || a.promoModel.localeCompare(b.promoModel));
    const best = items[0];
    const r = items[0];
    return {
      clientId: r.clientId, name: fullName(r), employeeId: r.clientEmployeeId, ownerName: r.ownerName,
      preferredContact: r.preferredContact, phone: r.phone, email: r.email,
      items, best, bestPercent: percentOf(best),
    };
  });
}

/** How to reach the client: their preferred channel first, else whatever is on file. */
function ContactLine({ g }: { g: ClientGroup }) {
  const viaEmail = g.preferredContact === "email" ? g.email : null;
  const value = viaEmail ?? g.phone ?? g.email;
  if (!value) return <div className="text-xs text-muted-foreground">No phone or email</div>;
  const Icon = viaEmail || (!g.phone && g.email) ? Mail : g.preferredContact === "text" ? MessageSquare : Phone;
  const how = g.preferredContact ? `Prefers ${g.preferredContact}` : "No preference";
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={how}>
      <Icon className="size-3.5 shrink-0" aria-label={how} />
      <span className="truncate">{value}</span>
    </div>
  );
}

/** "MV-2102-BLK, MV-3120-BLU, DRIFTWOOD collection ×6" — models first, then collections with their item count. */
function wantsSummary(g: ClientGroup): string {
  const models = g.items.filter((w) => w.matchType === "model").map((w) => w.promoModel);
  const collections = new Map<string, number>();
  for (const w of g.items) if (w.matchType !== "model") collections.set(w.promoCollection, (collections.get(w.promoCollection) ?? 0) + 1);
  const parts = [...models, ...[...collections].map(([c, n]) => `${c} collection${n > 1 ? ` ×${n}` : ""}`)];
  return parts.length > 3 ? `${parts.slice(0, 3).join(", ")} +${parts.length - 3} more` : parts.join(", ");
}

/** Sale price, MSRP struck through, and the % off. */
function PriceCell({ row, className }: { row: MatchedClientRow; className?: string }) {
  const pct = percentOf(row);
  return (
    <TableCell className={`text-right tabular-nums ${className ?? ""}`}>
      {row.discountPrice == null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="font-medium text-success">{formatMoney(row.discountPrice)}</span>
      )}
      <div className="text-xs text-muted-foreground">
        {row.msrp != null && <span className="line-through">{formatMoney(row.msrp)}</span>}
        {pct > 0 && <span className="ml-1.5 font-medium text-foreground">{pct}% off</span>}
      </div>
    </TableCell>
  );
}

export function MatchedClientsTab({ clients, truncated = false, isManager, currentUserId }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });
  const [ownerFilter, setOwnerFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [brandFilter, setBrandFilter] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  const toFirstPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));
  const toggleIn = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    setter(next);
    toFirstPage();
  };

  const owners = useMemo(
    () => Array.from(new Set(clients.map((c) => c.ownerName).filter((o): o is string => !!o))).sort(),
    [clients],
  );
  const brands = useMemo(
    () => Array.from(new Set(clients.map((c) => c.promoBrand).filter((b): b is string => !!b))).sort(),
    [clients],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = clients.filter((c) =>
      (!ownerFilter.size || (c.ownerName != null && ownerFilter.has(c.ownerName))) &&
      (!typeFilter.size || typeFilter.has(c.matchType)) &&
      (!brandFilter.size || (c.promoBrand != null && brandFilter.has(c.promoBrand))) &&
      (!q || fullName(c).toLowerCase().includes(q) || c.promoModel.toLowerCase().includes(q) || c.promoCollection.toLowerCase().includes(q)),
    );
    return group(kept);
  }, [clients, ownerFilter, typeFilter, brandFilter, query]);

  const itemCount = groups.reduce((n, g) => n + g.items.length, 0);

  const columns = useMemo<DataTableColumn<ClientGroup>[]>(() => [
    {
      id: "client",
      accessorFn: (g) => g.name.toLowerCase(),
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Client" />,
      cell: ({ row: { original: g } }) => (
        <TableCell className="max-w-44 sm:max-w-64">
          <div className="font-medium">
            {isManager || g.employeeId === currentUserId ? (
              <Link href={`/clients/${g.clientId}?from=promo-matches`} className="hover:underline">{g.name}</Link>
            ) : g.name}
          </div>
          <ContactLine g={g} />
          <div className="text-xs text-muted-foreground sm:hidden">{g.items.length} {g.items.length === 1 ? "item" : "items"}</div>
        </TableCell>
      ),
    },
    {
      id: "owner",
      accessorFn: (g) => (g.ownerName ?? "").toLowerCase(),
      meta: { headClassName: "hidden sm:table-cell" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Associate" />,
      cell: ({ row: { original: g } }) => (
        <TableCell className="hidden sm:table-cell">{g.ownerName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
      ),
    },
    {
      id: "wants",
      accessorFn: (g) => g.items.length,
      meta: { headClassName: "hidden sm:table-cell" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Wants" />,
      cell: ({ row: { original: g } }) => (
        <TableCell className="hidden sm:table-cell">
          <div className="text-sm">{g.items.length} {g.items.length === 1 ? "item" : "items"}</div>
          <div className="max-w-72 truncate font-mono text-xs text-muted-foreground" title={wantsSummary(g)}>{wantsSummary(g)}</div>
        </TableCell>
      ),
    },
    {
      id: "price",
      accessorFn: (g) => g.bestPercent,
      meta: { headClassName: "text-right" },
      // The item with the biggest discount, not the lowest price.
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Best deal" align="right" />,
      cell: ({ row: { original: g } }) => <PriceCell row={g.best} />,
    },
  ], [isManager, currentUserId]);

  const itemDetails = (w: MatchedClientRow) => (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-sm">{w.promoModel}</span>
        {/* Most matches are the model itself; only say so when it came through the collection. */}
        {w.matchType !== "model" && (
          <Badge variant="secondary" className="text-xs font-normal">via {w.promoCollection} collection</Badge>
        )}
        {isPromoUpcoming(w.promoStart) && (
          <Badge variant="outline" className="text-xs font-normal">Starts {format(parseISO(w.promoStart!), "EEE, MMM d")}</Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{[w.promoCollection, brandLabel(w.promoBrand)].filter(Boolean).join(" · ")}</div>
    </>
  );

  const renderItems = (g: ClientGroup) =>
    g.items.map((w) => (
      <TableRow key={`${w.clientId}|${w.promoModel}`} className="bg-muted/30 hover:bg-muted/40 [&>td]:py-1.5">
        <TableCell className="border-l-2 border-l-primary/50" />
        {/* Phones hide the Wants column, so the item sits under Client there. */}
        <TableCell><div className="sm:hidden">{itemDetails(w)}</div></TableCell>
        <TableCell className="hidden sm:table-cell" />
        <TableCell className="hidden sm:table-cell">{itemDetails(w)}</TableCell>
        <PriceCell row={w} />
      </TableRow>
    ));

  const renderFacet = (label: string, values: readonly string[], set: Set<string>, setter: (s: Set<string>) => void) => (
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Matched Clients
            {clients.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                {groups.length} {groups.length === 1 ? "client" : "clients"} · {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            )}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={query}
              onChangeAction={(v) => { setQuery(v); toFirstPage(); }}
              placeholder="Client, model or collection"
              aria-label="Search matched clients"
              className="w-full sm:w-56"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className={`size-4 mr-1.5 ${filtersActive ? "text-primary" : ""}`} />
                  Filters
                </Button>
              </PopoverTrigger>
              <PopoverContent className="flex flex-col w-64 gap-3" align="end">
                {renderFacet("Assigned associate", owners, ownerFilter, setOwnerFilter)}
                {renderFacet("Match type", MATCH_TYPES, typeFilter, setTypeFilter)}
                {renderFacet("Brand", brands, brandFilter, setBrandFilter)}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => { setOwnerFilter(new Set()); setTypeFilter(new Set()); setBrandFilter(new Set()); toFirstPage(); }}
                >
                  Clear filters
                </Button>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
              <Download className="size-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {truncated && (
          <Alert variant="warning" className="mb-4">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Showing the first {PAGE_READ_LIMIT.toLocaleString()} matches. Use Export CSV for the full set.
            </AlertDescription>
          </Alert>
        )}
        {clients.length === 0 ? (
          <EmptyState icon={Users} title="No matched clients" compact />
        ) : groups.length === 0 ? (
          <EmptyState icon={Users} title="No matches fit these filters" compact />
        ) : (
          <DataTable
            chrome={false}
            columns={columns}
            data={groups}
            getRowId={(g) => g.clientId}
            state={{ sorting, pagination }}
            onSortingChange={setSorting}
            onPaginationChange={setPagination}
            autoResetPageIndex={false}
            expandable={{ label: "item", render: (row) => renderItems(row.original) }}
            rowClassName={() => "hover:bg-muted/50"}
            pagination={{ itemLabel: "clients", variant: "icons", showBorder: true }}
          />
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
