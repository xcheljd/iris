"use client";

import { Fragment, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/stats-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchInput } from "@/components/search-input";
import { DatePicker } from "@/components/date-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/empty-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PaginationFooter } from "@/components/pagination-footer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Tag, Plus, Trash2, Watch, Users,
  MoreHorizontal, Upload, ClipboardPaste,
  FileSpreadsheet, AlertCircle, CheckCircle2, Trash, CalendarDays, Calendar,
} from "lucide-react";
import { createPromo, deletePromo, importPromos, clearAllPromos } from "@/lib/actions";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import type { PromoWatch } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { type ParsedPromoRow as ParsedRow, parsePasteData } from "@/lib/promo-csv-parser";

const PAGE_SIZE = 15;

interface PromoClientMatch {
  match: { id: string; matchType: string };
  client?: { firstName: string; lastName: string | null; phone: string | null };
}

interface PromosContentProps {
  promos: PromoWatch[];
  isManager: boolean;
}


function ImportPromoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<{ rows: ParsedRow[]; mapping: Record<string, number> | null; headers: string[] } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [promoStart, setPromoStart] = useState<Date | undefined>(undefined);
  const [promoEnd, setPromoEnd] = useState<Date | undefined>(undefined);

  const handleParse = () => {
    if (!rawText.trim()) return;
    const result = parsePasteData(rawText);
    setParsed(result);
  };

  const handleImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setIsImporting(true);
    try {
      const startStr = promoStart ? format(promoStart, "yyyy-MM-dd") : null;
      const endStr = promoEnd ? format(promoEnd, "yyyy-MM-dd") : null;
      const result = await importPromos(parsed.rows, startStr, endStr);
      toast.success(`Imported ${result.imported} promo watches`);
      setRawText(""); setParsed(null); setPromoStart(undefined); setPromoEnd(undefined);
      onOpenChange(false);
    } catch { toast.error("Failed to import promos"); }
    finally { setIsImporting(false); }
  };

  const handleReset = () => { setRawText(""); setParsed(null); };

  const handleSample = () => {
    setRawText("Model Number\tCollection\tMSRP\tDiscount %\tSale Price\nHX1009-01X\tSolaris\t395\t25\t296.25\nNR-710-12L\tMechanical\t275\t20\t220\nCA7060-87L\tWeekender\t350\t30\t245");
    const today = new Date();
    const end = new Date(today); end.setDate(end.getDate() + 7);
    setPromoStart(today);
    setPromoEnd(end);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Promo List
          </DialogTitle>
          <DialogDescription>
            Paste tab-delimited data from Excel. Headers are auto-detected.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">

        {!parsed ? (
          <div className="space-y-4">
            {/* Promo Date Range */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
              <div className="space-y-2 flex-1">
                <Label>Promo Start</Label>
                <DatePicker
                  date={promoStart}
                  onSelect={setPromoStart}
                  className="w-full"
                />
              </div>
              <div className="flex items-center pb-2 text-muted-foreground">—</div>
              <div className="space-y-2 flex-1">
                <Label>Promo End</Label>
                <DatePicker
                  date={promoEnd}
                  onSelect={setPromoEnd}
                  className="w-full"
                />
              </div>
              {(promoStart || promoEnd) && (
                <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => { setPromoStart(undefined); setPromoEnd(undefined); }}>
                  Clear
                </Button>
              )}
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Paste your data</Label>
              <Textarea placeholder="Paste Excel data here (tab-delimited)..." value={rawText} onChange={(e) => setRawText(e.target.value)} rows={8} className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">
                Copy rows from Excel and paste directly. Columns auto-detected: Model Number, Collection, MSRP, Discount %, Sale Price.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleParse} disabled={!rawText.trim()}>
                <Upload className="h-4 w-4 mr-2" />
                Parse Data
              </Button>
              <Button variant="outline" onClick={handleSample}>
                Load Sample
              </Button>
            </div>
          </div>
        ) : !parsed.mapping ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-yellow-500">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Could not detect columns</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Make sure your data has headers like: Model Number, Collection, MSRP, Discount %, Sale Price.
            </p>
            <Button variant="outline" onClick={handleReset}>Try Again</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-500">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Detected {Object.keys(parsed.mapping).length} columns — {parsed.rows.length} rows parsed</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Column mapping: {Object.entries(parsed.mapping).map(([k, v]) => `${k} → "${parsed.headers[v]}"`).join(" | ")}
            </div>
            {(promoStart || promoEnd) && (
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span>Promo period: {promoStart ? format(promoStart, "MMM d") : "?"} — {promoEnd ? format(promoEnd, "MMM d, yyyy") : "?"}</span>
              </div>
            )}
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Model Number</TableHead>
                    <TableHead>Collection</TableHead>
                    <TableHead className="text-right">MSRP</TableHead>
                    <TableHead className="text-right">Discount %</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.rows.slice(0, 20).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{row.modelNumber}</TableCell>
                      <TableCell>{row.collection}</TableCell>
                      <TableCell className="text-right">{row.msrp != null ? `$${row.msrp.toFixed(2)}` : "—"}</TableCell>
                      <TableCell className="text-right">{row.discountPercent != null ? `${row.discountPercent}%` : "—"}</TableCell>
                      <TableCell className="text-right">{row.discountPrice != null ? `$${row.discountPrice.toFixed(2)}` : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {parsed.rows.length > 20 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-sm">
                        ...and {parsed.rows.length - 20} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleReset}>Back</Button>
              <Button onClick={handleImport} disabled={isImporting || parsed.rows.length === 0}>
                {isImporting ? "Importing..." : `Import ${parsed.rows.length} Promos`}
              </Button>
            </DialogFooter>
          </div>
        )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function PromosContent({ promos: initialPromos, isManager }: PromosContentProps) {
  const router = useRouter();
  const [promos, setPromos] = useState(initialPromos);
  const [isCreating, setIsCreating] = useState(false);
  const [showMatches, setShowMatches] = useState<string | null>(null);
  const [matches, setMatches] = useState<PromoClientMatch[]>([]);
  const [newPromo, setNewPromo] = useState({ modelNumber: "", collection: "", msrp: "", discountPercent: "", discountPrice: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<PromoWatch | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!searchQuery) return promos;
    const q = searchQuery.toLowerCase();
    return promos.filter((p) => p.modelNumber.toLowerCase().includes(q) || p.collection.toLowerCase().includes(q));
  }, [promos, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalRetailValue = promos.reduce((sum, p) => sum + (p.msrp || 0), 0);
  const totalSavings = promos.reduce((sum, p) => sum + ((p.msrp || 0) - (p.discountPrice || 0)), 0);

  // Derive promo period from the data
  const promoStart = useMemo(() => {
    const starts = promos.map((p) => p.promoStart).filter(Boolean);
    if (starts.length === 0) return null;
    return starts.sort()[0];
  }, [promos]);

  const promoEnd = useMemo(() => {
    const ends = promos.map((p) => p.promoEnd).filter(Boolean);
    if (ends.length === 0) return null;
    return ends.sort().reverse()[0];
  }, [promos]);

  const handleCreatePromo = async () => {
    if (!newPromo.modelNumber.trim() || !newPromo.collection.trim()) {
      toast.error("Model number and collection are required");
      return;
    }
    setIsCreating(true);
    try {
      await createPromo(
        newPromo.modelNumber,
        newPromo.collection,
        newPromo.msrp ? parseFloat(newPromo.msrp) : null,
        newPromo.discountPercent ? parseFloat(newPromo.discountPercent) : null,
        newPromo.discountPrice ? parseFloat(newPromo.discountPrice) : null,
      );
      toast.success("Promo watch created");
      setNewPromo({ modelNumber: "", collection: "", msrp: "", discountPercent: "", discountPrice: "" });
      router.refresh();
    } catch { toast.error("Failed to create promo watch"); }
    finally { setIsCreating(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePromo(id);
      setPromos(promos.filter((p) => p.id !== id));
      toast.success("Promo deleted");
      setDeleteTarget(null);
    } catch { toast.error("Failed to delete promo"); }
  };

  const handleClearAll = async () => {
    try {
      await clearAllPromos();
      setPromos([]);
      toast.success("All promos cleared — ready for next week's list");
      setClearAllOpen(false);
    } catch { toast.error("Failed to clear promos"); }
  };

  const handleViewMatches = async (promoId: string) => {
    if (showMatches === promoId) { setShowMatches(null); return; }
    try {
      const response = await fetch(`/api/promos/matches?promoId=${promoId}`);
      if (response.ok) { const data = await response.json(); setMatches(data); setShowMatches(promoId); }
    } catch { toast.error("Failed to load matches"); }
  };

  return (
    <>
      <Topbar title="Promo Manager" />
      <div className="flex-1 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="sr-only">Promo Manager</h1>
          <p className="text-muted-foreground mt-1">
            Weekly promo watches — match them to interested clients
          </p>
        </div>
        {isManager && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <ClipboardPaste className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Single
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Promo Watch</DialogTitle>
                <DialogDescription>Add a single model to the current promo list.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="modelNumber">Model Number</Label>
                    <Input id="modelNumber" placeholder="e.g., HX1009-01X" value={newPromo.modelNumber} onChange={(e) => setNewPromo({ ...newPromo, modelNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="collection">Collection</Label>
                    <Input id="collection" placeholder="e.g., Solaris" value={newPromo.collection} onChange={(e) => setNewPromo({ ...newPromo, collection: e.target.value })} />
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="msrp">MSRP ($)</Label>
                    <Input id="msrp" type="number" step="0.01" placeholder="395.00" value={newPromo.msrp} onChange={(e) => setNewPromo({ ...newPromo, msrp: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discountPct">Discount (%)</Label>
                    <Input id="discountPct" type="number" step="0.1" placeholder="25" value={newPromo.discountPercent} onChange={(e) => setNewPromo({ ...newPromo, discountPercent: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discountPrice">Sale Price ($)</Label>
                    <Input id="discountPrice" type="number" step="0.01" placeholder="296.25" value={newPromo.discountPrice} onChange={(e) => setNewPromo({ ...newPromo, discountPrice: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreatePromo} disabled={isCreating} className="w-full">
                    {isCreating ? "Adding..." : "Add Promo Watch"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        )}
      </div>

      {/* Promo Period Banner */}
      {promos.length > 0 && (promoStart || promoEnd) && (
        <Card className="mb-6 border-blue-800/50 bg-blue-950/20">
          <CardContent className="py-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-blue-400" />
                <span className="text-sm font-medium">Current Promo Period</span>
                <span className="text-sm text-muted-foreground">
                  {promoStart ? format(parseISO(promoStart), "MMM d") : "?"} — {promoEnd ? format(parseISO(promoEnd), "MMM d, yyyy") : "?"}
                </span>
              </div>
              {isManager && (
              <Button variant="outline" size="sm" className="text-destructive h-7" onClick={() => setClearAllOpen(true)}>
                <Trash className="h-3 w-3 mr-1" />
                Clear All &amp; Reset
              </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatsCard label="Total Promos" value={promos.length} icon={Tag} />
        <StatsCard label="Total Retail Value" value={`$${totalRetailValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={FileSpreadsheet} iconClassName="text-blue-500" />
        <StatsCard label="Total Client Savings" value={`$${totalSavings.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={Calendar} iconClassName="text-green-500" valueClassName="text-green-500" />
      </div>

      {/* Promo Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Current Promo List</CardTitle>
            {isManager && promos.length > 0 && !(promoStart || promoEnd) && (
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setClearAllOpen(true)}>
                <Trash className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
          {/* Search */}
          <div className="mt-3">
            <SearchInput
              placeholder="Search model or collection..."
              value={searchQuery}
              onChange={(v) => { setSearchQuery(v); setPage(1); }}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {promos.length === 0 ? (
            <EmptyState
              icon={Watch}
              title="No active promos"
              description="Import this week's promo list to get started"
              {...(isManager ? { action: { label: "Import from Excel", onClick: () => setImportOpen(true), icon: ClipboardPaste } } : {})}
            />
          ) : filtered.length === 0 ? (
            <EmptyState description="No promos match your search" compact />
          ) : (
            <>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model Number</TableHead>
                    <TableHead>Collection</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">MSRP</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Disc.</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Sale Price</TableHead>
                    {isManager && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((promo) => (
                    <Fragment key={promo.id}>
                      <TableRow>
                        <TableCell className="font-medium font-mono text-sm">{promo.modelNumber}</TableCell>
                        <TableCell><Badge variant="outline">{promo.collection}</Badge></TableCell>
                        <TableCell className="text-right hidden sm:table-cell">{promo.msrp != null ? `$${promo.msrp.toFixed(2)}` : "—"}</TableCell>
                        <TableCell className="text-right hidden md:table-cell">{promo.discountPercent != null ? `${promo.discountPercent}%` : "—"}</TableCell>
                        <TableCell className="text-right hidden sm:table-cell font-medium text-green-500">{promo.discountPrice != null ? `$${promo.discountPrice.toFixed(2)}` : "—"}</TableCell>
                        {isManager && (
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewMatches(promo.id)}>
                                <Users className="h-4 w-4 mr-2" />
                                View Matches
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(promo)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        )}
                      </TableRow>
                      {showMatches === promo.id && (
                        <TableRow key={`${promo.id}-matches`}>
                          <TableCell colSpan={isManager ? 6 : 5} className="bg-muted/30 p-4">
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium">Matched Clients</h4>
                              {matches.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No client matches yet</p>
                              ) : (
                                <div className="space-y-1">
                                  {matches.map((m) => (
                                    <div key={m.match.id} className="flex items-center gap-2 text-sm">
                                      <Badge variant="outline" className="text-xs">{m.match.matchType}</Badge>
                                      <span>{m.client?.firstName} {m.client?.lastName || ""}</span>
                                      {m.client?.phone && <span className="text-muted-foreground">{m.client.phone}</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
              </div>

              <PaginationFooter
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
                variant="icons"
                showBorder
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Import Dialog */}
      {isManager && <ImportPromoDialog open={importOpen} onOpenChange={setImportOpen} />}

      {/* Delete Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Promo Watch"
        description={<>Remove <strong>{deleteTarget?.modelNumber}</strong> from the current promo list?</>}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        variant="destructive"
      />
      )}

      {/* Clear All Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={clearAllOpen}
        onOpenChange={setClearAllOpen}
        title="Clear All Promos"
        description={`This will permanently delete all ${promos.length} promo watches and their client matches. Use this to reset before importing next week's promo list.`}
        confirmLabel="Clear All"
        onConfirm={handleClearAll}
        variant="destructive"
      />
      )}
      </div>
    </>
  );
}
