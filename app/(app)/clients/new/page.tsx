"use client";

import { useRef, useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { catalogConflictMessage } from "@/lib/catalog-conflicts";
import { Topbar } from "@/components/topbar";
import { ClientForm } from "@/components/client-form";
import type { ClientFormData } from "@/components/client-form";
import type { ProductOfInterest } from "@/lib/db/schema";
import { MergeFromFormDialog } from "@/components/merge-client-dialog";
import { validateClientForm } from "@/lib/validation/client";
import { useCatalog } from "@/components/use-catalog";
import { correctCatalog } from "@/lib/actions";

export default function AddClientPage() {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateClient, setDuplicateClient] = useState<{ id: string; firstName: string; lastName?: string | null; phone?: string | null; email?: string | null } | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const { catalogMap, isManager, refetchCatalog } = useCatalog();
  const handleCorrectCatalog = async (m: string, c: string) => {
    await correctCatalog(m, c);
    await refetchCatalog();
  };

  const [formData, setFormData] = useState<ClientFormData>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    customerId: "",
    source: "Walk-in",
    preferredContact: "",
    birthday: null,
    anniversary: null,
    onEmailList: false,
    notes: "",
    tags: [],
  });

  const [newTag, setNewTag] = useState("");
  const [productsOfInterest, setProductsOfInterest] = useState<ProductOfInterest[]>([]);

  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const checkForDuplicates = async (data: ClientFormData) => {
    if (!data.firstName && !data.phone && !data.email) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`/api/clients/check-duplicates?firstName=${encodeURIComponent(data.firstName)}&lastName=${encodeURIComponent(data.lastName ?? "")}&phone=${encodeURIComponent(data.phone ?? "")}&email=${encodeURIComponent(data.email ?? "")}`, { signal: controller.signal });
      if (response.ok) {
        const result = await response.json();
        if (result.duplicate) {
          setDuplicateClient(result.duplicate);
          setShowDuplicateWarning(true);
        } else {
          setShowDuplicateWarning(false);
          setDuplicateClient(null);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Failed to check for duplicates", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleFieldChange = (field: string, value: string | boolean | Date | null | undefined | string[]) => {
    const updated = { ...formDataRef.current, [field]: value };
    setFormData(updated);
    if (field === "firstName" || field === "phone" || field === "email") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => checkForDuplicates(updated), 500);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, newTag.trim()] }));
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) }));
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
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formData, productsOfInterest }),
        });

        if (response.ok) {
          const data = await response.json();
          toast.success("Client created successfully");
          const conflictMsg = catalogConflictMessage(data.conflicts);
          if (conflictMsg) toast.warning(conflictMsg);
          router.push(`/clients/${data.id}`);
        } else if (response.status === 409) {
          const duplicateData = await response.json();
          setDuplicateClient(duplicateData);
          setShowDuplicateWarning(true);
        } else {
          toast.error("Failed to create client");
        }
      } catch (error) {
        toast.error("Failed to create client", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });
  };

  const handleEditExisting = () => {
    if (!duplicateClient) return;
    router.push(`/clients/${duplicateClient.id}`);
  };

  const handleMergeWithDuplicate = () => {
    setMergeDialogOpen(true);
  };

  return (
    <>
      <Topbar title="Add New Client" />
      <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="sr-only">Add New Client</h1>
              <p className="text-muted-foreground mt-1">
                Create a new client record in the CRM
              </p>
            </div>
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>

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
            onEditExisting={handleEditExisting}
            onMergeWithDuplicate={duplicateClient ? handleMergeWithDuplicate : undefined}
            showCommonTags
            isLoading={isPending}
            submitLabel="Create Client"
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
          />
          {duplicateClient && (
            <MergeFromFormDialog
              existingClientId={duplicateClient.id}
              formData={formData}
              productsOfInterest={productsOfInterest}
              open={mergeDialogOpen}
              onOpenChange={setMergeDialogOpen}
              onMerged={(winnerId) => router.push(`/clients/${winnerId}`)}
            />
          )}
        </div>
      </div>
    </>
  );
}
