"use client";

import { Fragment, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Tag, 
  Plus, 
  Eye, 
  EyeOff, 
  Trash2, 
  Watch, 
  Users,
  Search,
  Power,
  PowerOff
} from "lucide-react";
import { createPromo, togglePromo, deletePromo } from "@/lib/actions";
import { toast } from "sonner";
import { format } from "date-fns";
import type { PromoWatch } from "@/lib/db/schema";

interface PromosContentProps {
  promos: PromoWatch[];
}

export function PromosContent({ promos: initialPromos }: PromosContentProps) {
  const [promos, setPromos] = useState(initialPromos);
  const [isCreating, setIsCreating] = useState(false);
  const [showMatches, setShowMatches] = useState<string | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [newPromo, setNewPromo] = useState({ modelNumber: "", collection: "" });

  const handleCreatePromo = async () => {
    if (!newPromo.modelNumber.trim() || !newPromo.collection.trim()) {
      toast.error("Model number and collection are required");
      return;
    }

    setIsCreating(true);
    try {
      await createPromo(newPromo.modelNumber, newPromo.collection);
      toast.success("Promo watch created");
      setNewPromo({ modelNumber: "", collection: "" });
      // Reload page to refresh
      window.location.reload();
    } catch {
      toast.error("Failed to create promo watch");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await togglePromo(id, !active);
      setPromos(promos.map((p) => (p.id === id ? { ...p, active: !active } : p)));
      toast.success(active ? "Promo deactivated" : "Promo activated");
    } catch {
      toast.error("Failed to toggle promo");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePromo(id);
      setPromos(promos.filter((p) => p.id !== id));
      toast.success("Promo deleted");
    } catch {
      toast.error("Failed to delete promo");
    }
  };

  const handleViewMatches = async (promoId: string) => {
    if (showMatches === promoId) {
      setShowMatches(null);
      return;
    }
    try {
      const response = await fetch(`/api/promos/matches?promoId=${promoId}`);
      if (response.ok) {
        const data = await response.json();
        setMatches(data);
        setShowMatches(promoId);
      }
    } catch {
      toast.error("Failed to load matches");
    }
  };

  const activeCount = promos.filter((p) => p.active).length;

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Promo Manager</h1>
          <p className="text-muted-foreground mt-1">
            Track promo watches and match them to interested clients
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Promo Watch
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Promo Watch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="modelNumber">Model Number</Label>
                <Input
                  id="modelNumber"
                  placeholder="e.g., HX1009-01X"
                  value={newPromo.modelNumber}
                  onChange={(e) => setNewPromo({ ...newPromo, modelNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collection">Collection</Label>
                <Input
                  id="collection"
                  placeholder="e.g., Solaris"
                  value={newPromo.collection}
                  onChange={(e) => setNewPromo({ ...newPromo, collection: e.target.value })}
                />
              </div>
              <Button onClick={handleCreatePromo} disabled={isCreating} className="w-full">
                {isCreating ? "Creating..." : "Create Promo Watch"}
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
                <p className="text-sm text-muted-foreground">Total Promos</p>
                <p className="text-2xl font-bold">{promos.length}</p>
              </div>
              <Tag className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-500">{activeCount}</p>
              </div>
              <Power className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Inactive</p>
                <p className="text-2xl font-bold text-muted-foreground">{promos.length - activeCount}</p>
              </div>
              <PowerOff className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Promo Table */}
      <Card>
        <CardHeader>
          <CardTitle>Promo Watches</CardTitle>
        </CardHeader>
        <CardContent>
          {promos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Watch className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No promo watches</p>
              <p className="text-sm mt-1">
                Add a promo watch to track matching clients
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model Number</TableHead>
                  <TableHead>Collection</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promos.map((promo) => (
                  <Fragment key={promo.id}>
                    <TableRow>
                      <TableCell className="font-medium">{promo.modelNumber}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{promo.collection}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={promo.active ? "default" : "secondary"}>
                          {promo.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {promo.dateAdded ? format(new Date(promo.dateAdded), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewMatches(promo.id)}
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggle(promo.id, promo.active)}
                          >
                            {promo.active ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => handleDelete(promo.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {showMatches === promo.id && (
                      <TableRow key={`${promo.id}-matches`}>
                        <TableCell colSpan={5} className="bg-muted/30 p-4">
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium">Matched Clients</h4>
                            {matches.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No client matches yet</p>
                            ) : (
                              <div className="space-y-1">
                                {matches.map((m: any) => (
                                  <div key={m.match.id} className="flex items-center gap-2 text-sm">
                                    <Badge variant="outline" className="text-xs">
                                      {m.match.matchType}
                                    </Badge>
                                    <span>{m.client?.firstName} {m.client?.lastName || ""}</span>
                                    {m.client?.phone && (
                                      <span className="text-muted-foreground">{m.client.phone}</span>
                                    )}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}