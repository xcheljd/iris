"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/date-picker";
import { Plus, X, AlertCircle } from "lucide-react";

const CLIENT_SOURCES = [
  "Client Log",
  "Customer Report",
  "Walk-in",
  "Referral",
] as const;

const COMMON_TAGS = [
  "VIP", "repeat-buyer", "high-spender", "military", "birthday-this-month",
  "talker", "no-texts", "email-only", "crimson-ace", "meridian", "solar",
  "limited-edition", "mens", "womens", "watch", "collector",
];

interface DuplicateClient {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface ClientFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  customerId: string;
  employeeId?: string;
  source: string;
  birthday: Date | null;
  anniversary: Date | null;
  onEmailList: boolean;
  status?: "active" | "inactive" | "banned" | "unsubscribed";
  notes: string;
  tags: string[];
}

interface ClientFormProps {
  formData: ClientFormData;
  productsOfInterest: string[];
  newTag: string;
  productInterest: string;
  onFieldChange: (field: string, value: string | boolean | Date | null | undefined | string[]) => void;
  onNewTagChange: (value: string) => void;
  onProductInterestChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onAddProduct: () => void;
  onRemoveProduct: (product: string) => void;
  // Duplicate warning
  showDuplicateWarning: boolean;
  duplicateClient: DuplicateClient | null;
  onDismissDuplicate: () => void;
  onMergeDuplicate: () => void;
  // Edit-only
  employees?: { id: string; name: string; role: string }[];
  showCommonTags?: boolean;
  // Submit
  isLoading: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ClientForm({
  formData,
  productsOfInterest,
  newTag,
  productInterest,
  onFieldChange,
  onNewTagChange,
  onProductInterestChange,
  onAddTag,
  onRemoveTag,
  onAddProduct,
  onRemoveProduct,
  showDuplicateWarning,
  duplicateClient,
  onDismissDuplicate,
  onMergeDuplicate,
  employees,
  showCommonTags = false,
  isLoading,
  submitLabel,
  onSubmit,
  onCancel,
}: ClientFormProps) {
  return (
    <div className="space-y-6">
      {/* Duplicate Warning */}
      {showDuplicateWarning && duplicateClient && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-yellow-800 mb-2">Potential Duplicate Found</h4>
                <p className="text-sm text-yellow-700 mb-3">
                  This client may already exist in the system. Would you like to merge with the existing record?
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
                  <Button onClick={onMergeDuplicate} variant="default">
                    Merge with Existing
                  </Button>
                  <Button onClick={onDismissDuplicate} variant="outline">
                    Create New Record
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
                onChange={(e) => onFieldChange("firstName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                placeholder="Enter last name"
                value={formData.lastName}
                onChange={(e) => onFieldChange("lastName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer ID</Label>
              <Input
                id="customerId"
                placeholder="e.g. 100600045"
                value={formData.customerId}
                onChange={(e) => onFieldChange("customerId", e.target.value)}
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
                onChange={(e) => onFieldChange("phone", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="client@example.com"
                value={formData.email}
                onChange={(e) => onFieldChange("email", e.target.value)}
              />
            </div>
          </div>

          {employees && employees.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee Assignment</Label>
              <Select
                value={formData.employeeId || "__none__"}
                onValueChange={(value) => onFieldChange("employeeId", value === "__none__" ? "" : value)}
              >
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
          )}
        </CardContent>
      </Card>

      {/* Status & Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>
            {formData.status !== undefined ? "Status & Preferences" : "Preferences & Source"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.status !== undefined && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => onFieldChange("status", value)}
                >
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
                <Select value={formData.source} onValueChange={(value) => onFieldChange("source", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {formData.status === undefined && (
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Select value={formData.source} onValueChange={(value) => onFieldChange("source", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Email List</Label>
              <p className="text-sm text-muted-foreground">Add client to email marketing list</p>
            </div>
            <Switch
              checked={formData.onEmailList}
              onCheckedChange={(checked) => onFieldChange("onEmailList", checked)}
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
              <Label>Birthday (optional)</Label>
              <DatePicker
                date={formData.birthday ?? undefined}
                onSelect={(date) => onFieldChange("birthday", date)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Anniversary (optional)</Label>
              <DatePicker
                date={formData.anniversary ?? undefined}
                onSelect={(date) => onFieldChange("anniversary", date)}
                className="w-full"
              />
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
                onChange={(e) => onProductInterestChange(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    onAddProduct();
                  }
                }}
              />
              <Button onClick={onAddProduct} variant="outline">
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
                    onClick={() => onRemoveProduct(product)}
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
                onChange={(e) => onNewTagChange(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    onAddTag();
                  }
                }}
              />
              <Button onClick={onAddTag} variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {showCommonTags && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Common tags:</p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_TAGS.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                      onClick={() => {
                        if (!formData.tags.includes(tag)) {
                          onFieldChange("tags", [...formData.tags, tag]);
                        }
                      }}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag, index) => (
                <Badge key={index} variant="outline" className="cursor-pointer">
                  {tag}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 ml-1"
                    onClick={() => onRemoveTag(tag)}
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
          <CardTitle>Notes (optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Add any additional notes about this client..."
            value={formData.notes}
            onChange={(e) => onFieldChange("notes", e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-4 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={isLoading}>
          {isLoading ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
