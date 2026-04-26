"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Plus, Tag, X, CheckCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

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
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateClient, setDuplicateClient] = useState<ClientData | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    customerId: "",
    employeeId: "",
    source: "Walk-in",
    birthday: null as Date | null,
    anniversary: null as Date | null,
    onEmailList: false,
    status: "active" as "active" | "inactive" | "banned" | "unsubscribed",
    notes: "",
    tags: [] as string[],
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
    } catch (error) {
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

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field !== "notes") {
      clearTimeout((window as any).checkTimeout);
      (window as any).checkTimeout = setTimeout(checkForDuplicates, 500);
    }
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
    if (!formData.firstName.trim()) {
      toast.error("First name is required");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/clients/${client?.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          productsOfInterest,
        }),
      });

      if (response.ok) {
        toast.success("Client updated successfully");
        router.push(`/clients/${client?.id}`);
      } else if (response.status === 409) {
        // Handle duplicate detection
        const duplicateData = await response.json();
        setDuplicateClient(duplicateData);
        setShowDuplicateWarning(true);
      } else {
        toast.error("Failed to update client");
      }
    } catch (error) {
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
          sourceClientId: client?.id,
          targetClientId: duplicateClient.id,
        }),
      });

      if (response.ok) {
        toast.success("Clients merged successfully");
        setShowDuplicateWarning(false);
        router.push(`/clients/${duplicateClient.id}`);
      } else {
        toast.error("Failed to merge clients");
      }
    } catch (error) {
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
    <div className="container mx-auto py-6 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Edit Client</h1>
              <p className="text-muted-foreground mt-1">
                {client.firstName} {client.lastName}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>

        {/* Duplicate Warning */}
        {showDuplicateWarning && duplicateClient && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
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
              </div>
            </CardContent>
          </Card>
        )}

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  placeholder="Enter first name"
                  value={formData.firstName}
                  onChange={(e) => {
                    handleInputChange("firstName", e.target.value);
                    if (e.target.value) {
                      clearTimeout((window as any).checkTimeout);
                      (window as any).checkTimeout = setTimeout(checkForDuplicates, 500);
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Enter last name"
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
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="(XXX) XXX-XXXX"
                  value={formData.phone}
                  onChange={(e) => {
                    handleInputChange("phone", e.target.value);
                    if (e.target.value) {
                      clearTimeout((window as any).checkTimeout);
                      (window as any).checkTimeout = setTimeout(checkForDuplicates, 500);
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="client@example.com"
                  value={formData.email}
                  onChange={(e) => {
                    handleInputChange("email", e.target.value);
                    if (e.target.value) {
                      clearTimeout((window as any).checkTimeout);
                      (window as any).checkTimeout = setTimeout(checkForDuplicates, 500);
                    }
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee Assignment</Label>
              <Select value={formData.employeeId || "__none__"} onValueChange={(value) => handleInputChange("employeeId", value === "__none__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name} ({employee.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Status and Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Status & Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                    <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                  </SelectContent>
                </Select>
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
          </CardContent>
        </Card>

        {/* Important Dates */}
        <Card>
          <CardHeader>
            <CardTitle>Important Dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Birthday</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      {formData.birthday ? format(formData.birthday, "MMM d, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.birthday}
                      onSelect={(date) => handleInputChange("birthday", date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Anniversary</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      {formData.anniversary ? format(formData.anniversary, "MMM d, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.anniversary}
                      onSelect={(date) => handleInputChange("anniversary", date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Products of Interest */}
        <Card>
          <CardHeader>
            <CardTitle>Products of Interest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Add model number or collection..."
                  value={productInterest}
                  onChange={(e) => setProductInterest(e.target.value)}
                  onKeyPress={(e) => {
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
          </CardContent>
        </Card>

        {/* Tags */}
        <Card>
          <CardHeader>
            <CardTitle>Tags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => {
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
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Add any additional notes about this client..."
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-4 pt-4 border-t">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}