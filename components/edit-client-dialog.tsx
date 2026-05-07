"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Edit3 } from "lucide-react";
import { toast } from "sonner";
import type { FullClient } from "@/components/client-provider";
import { ClientForm, type ClientFormData } from "@/components/client-form";

interface EditClientDialogProps {
  client: FullClient;
  children?: React.ReactNode;
}

export function EditClientDialog({ client, children }: EditClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateClient, setDuplicateClient] = useState<{ id: string; firstName: string; lastName?: string | null; phone?: string | null; email?: string | null } | null>(null);
  const [formData, setFormData] = useState<ClientFormData>({
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

  const handleFieldChange = (field: string, value: string | boolean | Date | null | undefined | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, newTag.trim()] }));
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  const handleAddProduct = () => {
    if (productInterest.trim() && !productsOfInterest.includes(productInterest.trim())) {
      setProductsOfInterest((prev) => [...prev, productInterest.trim()]);
      setProductInterest("");
    }
  };

  const handleRemoveProduct = (product: string) => {
    setProductsOfInterest((prev) => prev.filter((p) => p !== product));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/clients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: client.id, ...formData, productsOfInterest }),
      });

      if (response.ok) {
        toast.success("Client updated successfully");
        setOpen(false);
      } else if (response.status === 409) {
        const duplicateData = await response.json();
        setDuplicateClient(duplicateData);
        setShowDuplicateWarning(true);
      } else {
        toast.error("Failed to update client");
      }
    } catch (error) {
      toast.error("Failed to update client", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(); }}>
      <DialogTrigger asChild>
        {children ? <div>{children}</div> : (
          <Button variant="outline" className="w-full">
            <Edit3 className="h-4 w-4 mr-2" />
            Edit Client
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <ClientForm
            formData={formData}
            productsOfInterest={productsOfInterest}
            newTag={newTag}
            productInterest={productInterest}
            onFieldChange={handleFieldChange}
            onNewTagChange={setNewTag}
            onProductInterestChange={setProductInterest}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            onAddProduct={handleAddProduct}
            onRemoveProduct={handleRemoveProduct}
            showDuplicateWarning={showDuplicateWarning}
            duplicateClient={duplicateClient}
            onDismissDuplicate={() => setShowDuplicateWarning(false)}
            onEditExisting={() => { setOpen(false); window.location.href = `/clients/${duplicateClient!.id}`; }}
            isLoading={isLoading}
            submitLabel="Save Changes"
            onSubmit={handleSubmit}
            onCancel={() => setOpen(false)}
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
