"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Edit3 } from "lucide-react";
import { toast } from "sonner";
import type { FullClient } from "@/components/client-provider";
import type { ProductOfInterest } from "@/lib/db/schema";
import { ClientForm, type ClientFormData } from "@/components/client-form";
import { validateClientForm } from "@/lib/validation/client";
import { useCatalog } from "@/components/use-catalog";
import { correctCatalog } from "@/lib/actions";

interface EditClientDialogProps {
  client: FullClient;
  children?: React.ReactNode;
}

export function EditClientDialog({ client, children }: EditClientDialogProps) {
  const [open, setOpen] = useState(false);
  const { catalogMap, isManager, refetchCatalog } = useCatalog();
  const handleCorrectCatalog = async (m: string, c: string) => {
    await correctCatalog(m, c);
    await refetchCatalog();
  };
  const [isPending, start] = useTransition();
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
  const [productsOfInterest, setProductsOfInterest] = useState<ProductOfInterest[]>(client.productsOfInterest || []);

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

  const handleSubmit = () => {
    const validationError = validateClientForm(formData);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    start(async () => {
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
      }
    });
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
            catalogMap={catalogMap}
            isManager={isManager}
            onCorrectCatalog={handleCorrectCatalog}
            formData={formData}
            productsOfInterest={productsOfInterest}
            newTag={newTag}
            onFieldChange={handleFieldChange}
            onNewTagChange={setNewTag}
            onProductsChange={setProductsOfInterest}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            showDuplicateWarning={showDuplicateWarning}
            duplicateClient={duplicateClient}
            onDismissDuplicate={() => setShowDuplicateWarning(false)}
            onEditExisting={() => { setOpen(false); window.location.href = `/clients/${duplicateClient!.id}`; }}
            isLoading={isPending}
            submitLabel="Save Changes"
            onSubmit={handleSubmit}
            onCancel={() => setOpen(false)}
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
