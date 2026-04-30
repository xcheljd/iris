"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/date-picker";
import { Edit3, X, Plus } from "lucide-react";
import { toast } from "sonner";
import type { FullClient } from "@/components/client-provider";

interface EditClientDialogProps {
  client: FullClient;
}

export function EditClientDialog({ client }: EditClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateClient, setDuplicateClient] = useState<{ id: string; firstName: string; lastName?: string | null; phone?: string | null; email?: string | null } | null>(null);
  
  const [formData, setFormData] = useState({
    firstName: client.firstName,
    lastName: client.lastName || "",
    phone: client.phone || "",
    email: client.email || "",
    customerId: client.customerId || "",
    source: client.source,
    birthday: client.birthday ? new Date(client.birthday) : null,
    anniversary: client.anniversary ? new Date(client.anniversary) : null,
    onEmailList: client.onEmailList,
    notes: client.notes || "",
    tags: (client.tags || []) as string[],
  });

  const [newTag, setNewTag] = useState("");
  const [productInterest, setProductInterest] = useState("");
  const [productsOfInterest, setProductsOfInterest] = useState<string[]>(client.productsOfInterest || []);

  const resetForm = () => {
    setFormData({
      firstName: client.firstName,
      lastName: client.lastName || "",
      phone: client.phone || "",
      email: client.email || "",
      customerId: client.customerId || "",
      source: client.source,
      birthday: client.birthday ? new Date(client.birthday) : null,
      anniversary: client.anniversary ? new Date(client.anniversary) : null,
      onEmailList: client.onEmailList,
      notes: client.notes || "",
      tags: (client.tags || []) as string[],
    });
    setProductsOfInterest(client.productsOfInterest || []);
    setNewTag("");
    setProductInterest("");
    setShowDuplicateWarning(false);
    setDuplicateClient(null);
  };



  const handleInputChange = (field: string, value: string | boolean | Date | null | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleAddProductInterest = () => {
    if (productInterest.trim() && !productsOfInterest.includes(productInterest.trim())) {
      setProductsOfInterest(prev => [...prev, productInterest.trim()]);
      setProductInterest("");
    }
  };

  const handleRemoveProductInterest = (productToRemove: string) => {
    setProductsOfInterest(prev => prev.filter(product => product !== productToRemove));
  };

  const handleSubmit = async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/clients", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: client.id,
          ...formData,
          productsOfInterest,
        }),
      });

      if (response.ok) {
        toast.success("Client updated successfully");
        setOpen(false);
        // In a real app, you'd want to revalidate the data
      } else if (response.status === 409) {
        // Handle duplicate detection
        const duplicateData = await response.json();
        setDuplicateClient(duplicateData);
        setShowDuplicateWarning(true);
      } else {
        toast.error("Failed to update client");
      }
    } catch (_error) {
      toast.error("Failed to update client");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMergeDuplicate = async () => {
    if (!duplicateClient) return;

    try {
      const response = await fetch("/api/clients/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceClientId: client.id,
          targetClientId: duplicateClient.id,
        }),
      });

      if (response.ok) {
        toast.success("Clients merged successfully");
        setShowDuplicateWarning(false);
        setOpen(false);
        window.location.href = `/clients/${duplicateClient.id}`;
      } else {
        toast.error("Failed to merge clients");
      }
    } catch (_error) {
      toast.error("Failed to merge clients");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Edit3 className="h-4 w-4 mr-2" />
          Edit Client
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
        </DialogHeader>

        {showDuplicateWarning && duplicateClient && (
          <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
            <h4 className="font-semibold text-yellow-800 mb-2">Potential Duplicate Found</h4>
            <p className="text-sm text-yellow-700 mb-3">
              This client may be a duplicate of another client. Would you like to merge them?
            </p>
            <div className="space-y-2 mb-3">
              <div className="text-sm">
                <strong>Existing client:</strong> {duplicateClient.firstName} {duplicateClient.lastName}
              </div>
              {duplicateClient.phone && (
                <div className="text-sm text-muted-foreground">Phone: {duplicateClient.phone}</div>
              )}
              {duplicateClient.email && (
                <div className="text-sm text-muted-foreground">Email: {duplicateClient.email}</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleMergeDuplicate} variant="default">
                Merge Clients
              </Button>
              <Button onClick={() => setShowDuplicateWarning(false)} variant="outline">
                Keep Separate
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange("firstName", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange("lastName", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerId">Customer ID</Label>
                <Input
                  id="customerId"
                  placeholder="e.g. 100600045"
                  value={formData.customerId}
                  onChange={(e) => handleInputChange("customerId", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Contact Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="(XXX) XXX-XXXX"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Preferences</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email List</Label>
                  <p className="text-sm text-muted-foreground">Add client to email marketing list</p>
                </div>
                <Switch
                  checked={formData.onEmailList}
                  onCheckedChange={(checked) => handleInputChange("onEmailList", checked)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="source">Source</Label>
                <Select value={formData.source} onValueChange={(value) => handleInputChange("source", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Client Log">Client Log</SelectItem>
                    <SelectItem value="Customer Report">Customer Report</SelectItem>
                    <SelectItem value="Walk-in">Walk-in</SelectItem>
                    <SelectItem value="Referral">Referral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Important Dates</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Birthday</Label>
                <DatePicker
                  date={formData.birthday ?? undefined}
                  onSelect={(date) => handleInputChange("birthday", date ?? null)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Anniversary</Label>
                <DatePicker
                  date={formData.anniversary ?? undefined}
                  onSelect={(date) => handleInputChange("anniversary", date ?? null)}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Products of Interest */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Products of Interest</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Add model number or collection..."
                  value={productInterest}
                  onChange={(e) => setProductInterest(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddProductInterest();
                    }
                  }}
                />
                <Button onClick={handleAddProductInterest} variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {productsOfInterest.map((product, index) => (
                  <Badge key={index} variant="secondary" className="cursor-pointer">
                    {product}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 ml-1"
                      onClick={() => handleRemoveProductInterest(product)}
                      aria-label={`Remove ${product}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Tags</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddTag();
                    }
                  }}
                />
                <Button onClick={handleAddTag} variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, index) => (
                  <Badge key={index} variant="outline" className="cursor-pointer">
                    {tag}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 ml-1"
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Notes</h3>
            <Textarea
              placeholder="Add any additional notes about this client..."
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}