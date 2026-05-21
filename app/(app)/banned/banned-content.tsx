"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { PaginationFooter } from "@/components/pagination-footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/stats-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Ban,
  ShieldOff,
  AlertTriangle,
  MoreHorizontal,
  Eye,
} from "lucide-react";
import { SearchInput } from "@/components/search-input";
import { banClient, unbanClient } from "@/lib/actions";
import { toast } from "sonner";
import { format } from "date-fns";
import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { EmptyState } from "@/components/empty-state";
import type { BannedCustomer } from "@/lib/db/schema";

interface BannedRow {
  banned: BannedCustomer;
  clientId: string | null;
}

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

function getCategoryBadge(category: string) {
  switch (category) {
    case "Reselling":
      return <Badge variant="destructive">Reselling</Badge>;
    case "Gift Card Fraud":
      return <Badge variant="destructive" className="bg-orange-600 hover:bg-orange-600/90 text-white">Gift Card Fraud</Badge>;
    default:
      return <Badge variant="secondary">{category}</Badge>;
  }
}

export function BannedContent({ banned: initialBanned, isManager }: { banned: BannedRow[]; isManager: boolean }) {
  const router = useRouter();
  const [banned, setBanned] = useState(initialBanned);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [unbanTarget, setUnbanTarget] = useState<BannedRow | null>(null);
  const [banForm, setBanForm] = useState({
    clientId: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    category: "Other" as "Reselling" | "Gift Card Fraud" | "Other",
    reason: "",
  });
  const [banSubmitting, setBanSubmitting] = useState(false);

  const filteredBanned = searchQuery
    ? banned.filter(
        (row) =>
          `${row.banned.firstName} ${row.banned.lastName || ""} ${row.banned.email || ""} ${row.banned.phone || ""}`
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      )
    : banned;

  const totalPages = Math.ceil(filteredBanned.length / PAGE_SIZE);
  const paged = filteredBanned.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleUnban = async (row: BannedRow) => {
    if (!row.clientId) return;
    try {
      await unbanClient(row.clientId);
      setBanned(banned.filter((r) => r.banned.id !== row.banned.id));
      toast.success("Customer unbanned");
    } catch {
      toast.error("Failed to unban customer");
    } finally {
      setUnbanTarget(null);
    }
  };

  const handleBan = async () => {
    if (!banForm.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    setBanSubmitting(true);
    try {
      await banClient(banForm.clientId || "", banForm.category, banForm.reason);
      toast.success("Customer banned successfully");
      setShowBanDialog(false);
      setBanForm({
        clientId: "",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        category: "Other",
        reason: "",
      });
      router.refresh();
    } catch {
      toast.error("Failed to ban customer");
    } finally {
      setBanSubmitting(false);
    }
  };

  return (
    <>
      <Topbar title="Banned Customers" />
      <div className="flex-1 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="sr-only">Banned Customers</h1>
          <p className="text-muted-foreground mt-1">
            Manage customer bans for compliance
          </p>
        </div>
        {isManager && (
        <Dialog open={showBanDialog} onOpenChange={setShowBanDialog}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Ban className="h-4 w-4 mr-2" />
                  Ban Customer
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Add a new customer to the banned list</TooltipContent>
          </Tooltip>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ban Customer</DialogTitle>
              <DialogDescription>Add a customer to the banned list with a reason and category.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="banFirstName">First Name *</Label>
                  <Input
                    id="banFirstName"
                    placeholder="Required"
                    value={banForm.firstName}
                    onChange={(e) => setBanForm({ ...banForm, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="banLastName">Last Name</Label>
                  <Input
                    id="banLastName"
                    placeholder="Optional"
                    value={banForm.lastName}
                    onChange={(e) => setBanForm({ ...banForm, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="banEmail">Email</Label>
                <Input
                  id="banEmail"
                  type="email"
                  placeholder="Optional"
                  value={banForm.email}
                  onChange={(e) => setBanForm({ ...banForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="banPhone">Phone</Label>
                <Input
                  id="banPhone"
                  placeholder="Optional"
                  value={banForm.phone}
                  onChange={(e) => setBanForm({ ...banForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={banForm.category}
                  onValueChange={(value) => setBanForm({ ...banForm, category: value as typeof banForm.category })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Reselling">Reselling</SelectItem>
                    <SelectItem value="Gift Card Fraud">Gift Card Fraud</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="banReason">Reason / Details</Label>
                <Textarea
                  id="banReason"
                  placeholder="Describe the reason for this ban..."
                  value={banForm.reason}
                  onChange={(e) => setBanForm({ ...banForm, reason: e.target.value })}
                  rows={3}
                />
              </div>
              <Separator />
              <Button onClick={handleBan} variant="destructive" className="w-full" disabled={banSubmitting}>
                {banSubmitting ? "Banning..." : "Ban Customer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatsCard label="Total Banned" value={banned.length} icon={Ban} iconClassName="text-red-500" valueClassName="text-red-500" />
        <StatsCard label="Reselling" value={banned.filter((r) => r.banned.banReasonCategory === "Reselling").length} icon={AlertTriangle} iconClassName="text-orange-500" />
        <StatsCard label="Gift Card Fraud" value={banned.filter((r) => r.banned.banReasonCategory === "Gift Card Fraud").length} icon={AlertTriangle} iconClassName="text-yellow-500" />
      </div>

      {/* Banned List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Banned List</CardTitle>
            {banned.length > 0 && (
              <Badge variant="secondary">{filteredBanned.length} record{filteredBanned.length !== 1 ? "s" : ""}</Badge>
            )}
          </div>
          <SearchInput
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChangeAction={(v) => { setSearchQuery(v); setPage(1); }}
          />
        </CardHeader>
        <CardContent>
          {filteredBanned.length === 0 ? (
            <EmptyState
              icon={ShieldOff}
              title={searchQuery ? "No matching records" : "No banned customers"}
              description={searchQuery ? "Try a different search term" : "Banned customers will appear here"}
            />
          ) : (
            <>
            <Accordion type="multiple" className="space-y-2">
              {paged.map((row) => {
                const customer = row.banned;
                return (
                  <AccordionItem key={customer.id} value={customer.id} className="border rounded-lg px-0 relative">
                    <AccordionTrigger className="flex items-center gap-3 py-3 px-4 hover:bg-muted/50 transition-colors hover:no-underline">
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2">
                          {row.clientId ? (
                            <Link
                              href={`/clients/${row.clientId}`}
                              className="font-medium hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {customer.firstName} {customer.lastName || ""}
                            </Link>
                          ) : (
                            <span className="font-medium">
                              {customer.firstName} {customer.lastName || ""}
                            </span>
                          )}
                          {getCategoryBadge(customer.banReasonCategory)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Banned {customer.banDate ? format(new Date(customer.banDate), "MMM d, yyyy") : "—"}
                        </p>
                      </div>
                    </AccordionTrigger>
                    {isManager && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 shrink-0 absolute right-10 top-1/2 -translate-y-1/2 z-10"
                          aria-label="Actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {row.clientId && (
                          <DropdownMenuItem asChild>
                            <Link href={`/clients/${row.clientId}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Client Page
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setUnbanTarget(row)}
                        >
                          <ShieldOff className="h-4 w-4 mr-2" />
                          Unban
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    )}
                    <AccordionContent className="px-4 pb-4">
                      <Separator className="mb-4" />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Contact</p>
                          {(customer.email || customer.phone) ? (
                            <div className="space-y-1">
                              {customer.email && (
                                <p className="text-sm flex items-center gap-2">
                                  <span className="text-muted-foreground">Email:</span>
                                  {customer.email}
                                </p>
                              )}
                              {customer.phone && (
                                <p className="text-sm flex items-center gap-2">
                                  <span className="text-muted-foreground">Phone:</span>
                                  {customer.phone}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No contact info</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Ban Details</p>
                          <div className="text-sm flex items-center gap-2">
                            <span className="text-muted-foreground">Category:</span>
                            {getCategoryBadge(customer.banReasonCategory)}
                          </div>
                          {customer.specificBanReason && (
                            <div>
                              <p className="text-sm text-muted-foreground">Reason:</p>
                              <p className="text-sm mt-0.5">{customer.specificBanReason}</p>
                            </div>
                          )}
                          {customer.notes && (
                            <div>
                              <p className="text-sm text-muted-foreground">Notes:</p>
                              <p className="text-sm mt-0.5">{customer.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
            <PaginationFooter
              currentPage={page}
              totalPages={totalPages}
              onPageChangeAction={setPage}
              totalItems={filteredBanned.length}
              pageSize={PAGE_SIZE}
              itemLabel="records"
            />
            </>
          )}
        </CardContent>
      </Card>

      {/* Unban Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={!!unbanTarget}
        onOpenChangeAction={(open) => !open && setUnbanTarget(null)}
        title="Unban Customer"
        description={
          <>
            Are you sure you want to unban{" "}
            <strong>
              {unbanTarget?.banned.firstName} {unbanTarget?.banned.lastName || ""}
            </strong>
            ? They will be able to interact with your business again.
          </>
        }
        confirmLabel="Unban"
        onConfirmAction={() => unbanTarget && handleUnban(unbanTarget)}
      />
      )}
      </div>
    </>
  );
}
