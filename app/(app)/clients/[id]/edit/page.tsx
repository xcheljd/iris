"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Topbar } from "@/components/topbar";
import { ClientForm } from "@/components/client-form";
import type { ClientFormData } from "@/components/client-form";

interface ClientData {
  id: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  employeeId?: string;
  dateAdded: string;
  productsOfInterest: string[];
  notes?: string;
  onEmailList: boolean;
  status: "active" | "inactive" | "banned" | "unsubscribed";
  source: "Client Log" | "Customer Report" | "Walk-in" | "Referral";
  birthday?: string;
  anniversary?: string;
  tags: string[];
  heatScore: number;
  heatLevel: "hot" | "warm" | "cold";
  lastOutreachAt?: string;
  lastPurchaseAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface Employee {
  id: string;
  name: string;
  role: string;
}

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [_isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateClient, setDuplicateClient] = useState<ClientData | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [formData, setFormData] = useState<ClientFormData>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    customerId: "",
    employeeId: "",
    source: "Walk-in",
    birthday: null,
    anniversary: null,
    onEmailList: false,
    status: "active",
    notes: "",
    tags: [],
  });

  const [newTag, setNewTag] = useState("");
  const [productInterest, setProductInterest] = useState("");
  const [productsOfInterest, setProductsOfInterest] = useState<string[]>([]);

  useEffect(() => {
    if (params.id) {
      fetchClient(params.id as string);
    }
    fetchEmployees();
  }, [params.id]);

  const fetchClient = async (clientId: string) => {
    try {
      const response = await fetch(`/api/clients/${clientId}`);
      if (response.ok) {
        const data = await response.json();
        setClient(data);
        setFormData({
          firstName: data.firstName,
          lastName: data.lastName || "",
          phone: data.phone || "",
          email: data.email || "",
          customerId: data.customerId || "",
          employeeId: data.employeeId || "",
          source: data.source,
          birthday: data.birthday ? new Date(data.birthday) : null,
          anniversary: data.anniversary ? new Date(data.anniversary) : null,
          onEmailList: data.onEmailList,
          status: data.status,
          notes: data.notes || "",
          tags: data.tags || [],
        });
        setProductsOfInterest(data.productsOfInterest || []);
      }
    } catch (_error) {
      toast.error("Failed to fetch client data");
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await fetch("/api/employees");
      if (response.ok) {
        const data = await response.json();
        setEmployees(data);
      }
    } catch (error) {
      console.error("Failed to fetch employees:", error);
    }
  };

  const checkForDuplicates = async () => {
    if (!formData.firstName && !formData.phone && !formData.email) return;

    setIsCheckingDuplicates(true);
    try {
      const response = await fetch(`/api/clients/check-duplicates?firstName=${formData.firstName}&phone=${formData.phone}&email=${formData.email}`);
      if (response.ok) {
        const data = await response.json();
        if (data.duplicate && data.duplicate.id !== client?.id) {
          setDuplicateClient(data.duplicate);
          setShowDuplicateWarning(true);
        } else {
          setShowDuplicateWarning(false);
          setDuplicateClient(null);
        }
      }
    } catch (error) {
      console.error("Failed to check duplicates:", error);
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const handleFieldChange = (field: string, value: string | boolean | Date | null | undefined | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field !== "notes") {
      clearTimeout((window as unknown as Record<string, ReturnType<typeof setTimeout>>).checkTimeout);
      (window as unknown as Record<string, ReturnType<typeof setTimeout>>).checkTimeout = setTimeout(checkForDuplicates, 500);
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

  const handleAddProduct = () => {
    if (productInterest.trim() && !productsOfInterest.includes(productInterest.trim())) {
      setProductsOfInterest(prev => [...prev, productInterest.trim()]);
      setProductInterest("");
    }
  };

  const handleRemoveProduct = (productToRemove: string) => {
    setProductsOfInterest(prev => prev.filter(product => product !== productToRemove));
  };

  const handleSubmit = async () => {
    if (!formData.firstName.trim()) {
      toast.error("First name is required");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/clients/${client?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, productsOfInterest }),
      });

      if (response.ok) {
        toast.success("Client updated successfully");
        router.push(`/clients/${client?.id}`);
      } else if (response.status === 409) {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceClientId: client?.id, targetClientId: duplicateClient.id }),
      });

      if (response.ok) {
        toast.success("Clients merged successfully");
        setShowDuplicateWarning(false);
        router.push(`/clients/${duplicateClient.id}`);
      } else {
        toast.error("Failed to merge clients");
      }
    } catch (_error) {
      toast.error("Failed to merge clients");
    }
  };

  if (!client) {
    return (
      <div className="container mx-auto py-6 max-w-4xl">
        <div className="text-center">
          <p>Loading client data...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Topbar title="Edit Client" />
      <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="sr-only">Edit Client</h1>
              <p className="text-muted-foreground">
                {client.firstName} {client.lastName}
              </p>
            </div>
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>

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
            onMergeDuplicate={handleMergeDuplicate}
            employees={employees}
            isLoading={isLoading}
            submitLabel="Save Changes"
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
          />
        </div>
      </div>
    </>
  );
}
