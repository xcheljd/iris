"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Ban,
  ShieldOff,
  Search,
  AlertTriangle,
  Trash2,
  User,
  Mail,
  Phone,
  MapPin,
  FileText
} from "lucide-react";
import { banClient, unbanCustomer } from "@/lib/actions";
import { toast } from "sonner";
import { format } from "date-fns";
import type { BannedCustomer } from "@/lib/db/schema";

interface BannedContentProps {
  banned: BannedCustomer[];
}

export function BannedContent({ banned: initialBanned }: BannedContentProps) {
  const [banned, setBanned] = useState(initialBanned);
  const [searchQuery, setSearchQuery] = useState("");
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [banForm, setBanForm] = useState({
    clientId: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    category: "Other" as "Reselling" | "Gift Card Fraud" | "Other",
    reason: "",
  });

  const filteredBanned = searchQuery
    ? banned.filter(
        (b) =>
          `${b.firstName} ${b.lastName || ""} ${b.email || ""} ${b.phone || ""}`
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      )
    : banned;

  const handleUnban = async (id: string) => {
    try {
      await unbanCustomer(id);
      setBanned(banned.filter((b) => b.id !== id));
      toast.success("Customer unbanned");
    } catch {
      toast.error("Failed to unban customer");
    }
  };

  const handleBan = async () => {
    if (!banForm.firstName.trim()) {
      toast.error("Name is required");
      return;
    }

    try {
      await banClient(
        banForm.clientId || "",
        banForm.category,
        banForm.reason
      );
      toast.success("Customer banned");
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
      window.location.reload();
    } catch {
      toast.error("Failed to ban customer");
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Banned Customers</h1>
          <p className="text-muted-foreground mt-1">
            Manage customer bans for compliance
          </p>
        </div>
        <Dialog open={showBanDialog} onOpenChange={setShowBanDialog}>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Ban className="h-4 w-4 mr-2" />
              Ban Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ban Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="banFirstName">First Name *</Label>
                  <Input
                    id="banFirstName"
                    value={banForm.firstName}
                    onChange={(e) => setBanForm({ ...banForm, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="banLastName">Last Name</Label>
                  <Input
                    id="banLastName"
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
                  value={banForm.email}
                  onChange={(e) => setBanForm({ ...banForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="banPhone">Phone</Label>
                <Input
                  id="banPhone"
                  value={banForm.phone}
                  onChange={(e) => setBanForm({ ...banForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={banForm.category}
                  onValueChange={(value) => setBanForm({ ...banForm, category: value as any })}
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
                <Label htmlFor="banReason">Reason</Label>
                <Textarea
                  id="banReason"
                  value={banForm.reason}
                  onChange={(e) => setBanForm({ ...banForm, reason: e.target.value })}
                  rows={3}
                />
              </div>
              <Button onClick={handleBan} variant="destructive" className="w-full">
                Ban Customer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Banned</p>
                <p className="text-2xl font-bold text-red-500">{banned.length}</p>
              </div>
              <Ban className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Reselling</p>
                <p className="text-2xl font-bold">
                  {banned.filter((b) => b.banReasonCategory === "Reselling").length}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gift Card Fraud</p>
                <p className="text-2xl font-bold">
                  {banned.filter((b) => b.banReasonCategory === "Gift Card Fraud").length}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Banned Table */}
      <Card>
        <CardHeader>
          <CardTitle>Banned List</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search banned customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredBanned.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldOff className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No banned customers</p>
              <p className="text-sm mt-1">Banned customers will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBanned.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">
                      {customer.firstName} {customer.lastName || ""}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {customer.email && (
                          <p className="text-sm flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </p>
                        )}
                        {customer.phone && (
                          <p className="text-sm flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {customer.phone}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          customer.banReasonCategory === "Reselling"
                            ? "destructive"
                            : customer.banReasonCategory === "Gift Card Fraud"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {customer.banReasonCategory}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {customer.specificBanReason || "—"}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {customer.banDate ? format(new Date(customer.banDate), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnban(customer.id)}
                      >
                        <ShieldOff className="h-4 w-4 mr-1" />
                        Unban
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}