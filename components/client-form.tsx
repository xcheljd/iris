"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DatePicker } from "@/components/date-picker";
import { Plus, X, AlertCircle } from "lucide-react";

import { CLIENT_SOURCE_VALUES, type ProductOfInterest } from "@/lib/db/schema";
import { ProductsOfInterestInput } from "@/components/products-of-interest-input";
import { COMMON_TAGS } from "@/lib/constants";
import type { CatalogEntry } from "@/lib/actions/model-catalog";

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
  preferredContact: "" | "call" | "text" | "email";
  birthday: Date | null;
  anniversary: Date | null;
  onEmailList: boolean;
  status?: "active" | "inactive" | "banned" | "unsubscribed";
  notes: string;
  tags: string[];
}

interface ClientFormProps {
  formData: ClientFormData;
  productsOfInterest: ProductOfInterest[];
  newTag: string;
  catalogIndex?: Record<string, CatalogEntry> | null;
  isManager?: boolean;
  onFieldChangeAction: (field: string, value: string | boolean | Date | null | undefined | string[]) => void;
  onNewTagChangeAction: (value: string) => void;
  onProductsChangeAction: (next: ProductOfInterest[]) => void;
  onAddTagAction: () => void;
  onRemoveTagAction: (tag: string) => void;
  // Duplicate warning
  showDuplicateWarning: boolean;
  duplicateClient: DuplicateClient | null;
  onDismissDuplicateAction: () => void;
  onEditExistingAction: () => void;
  onMergeWithDuplicateAction?: () => void;
  // Edit-only
  employees?: { id: string; name: string; role: string }[];
  showCommonTags?: boolean;
  // Submit
  isLoading: boolean;
  submitLabel: string;
  onSubmitAction: () => void;
  onCancelAction: () => void;
}

export function ClientForm({
  formData,
  productsOfInterest,
  newTag,
  catalogIndex,
  isManager,
  onFieldChangeAction,
  onNewTagChangeAction,
  onProductsChangeAction,
  onAddTagAction,
  onRemoveTagAction,
  showDuplicateWarning,
  duplicateClient,
  onDismissDuplicateAction,
  onEditExistingAction,
  onMergeWithDuplicateAction,
  employees,
  showCommonTags = false,
  isLoading,
  submitLabel,
  onSubmitAction,
  onCancelAction,
}: ClientFormProps) {
  return (
    <div className="space-y-6">
      {/* Duplicate Warning */}
      {showDuplicateWarning && duplicateClient && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Potential Duplicate Found</AlertTitle>
          <AlertDescription>
            This client may already exist in the system. Would you like to merge with the existing record?
            <div className="mt-2 space-y-1">
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
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button onClick={onEditExistingAction} variant="default" size="sm">
                Edit Existing
              </Button>
              {onMergeWithDuplicateAction && (
                <Button onClick={onMergeWithDuplicateAction} variant="outline" size="sm">
                  Merge Records
                </Button>
              )}
              <Button onClick={onDismissDuplicateAction} variant="outline" size="sm">
                Create New Record
              </Button>
            </div>
          </AlertDescription>
        </Alert>
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
                onChange={(e) => onFieldChangeAction("firstName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                placeholder="Enter last name"
                value={formData.lastName}
                onChange={(e) => onFieldChangeAction("lastName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredContact">Preferred Contact *</Label>
              <Select
                value={formData.preferredContact || undefined}
                onValueChange={(v) => onFieldChangeAction("preferredContact", v)}
              >
                <SelectTrigger id="preferredContact">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer ID</Label>
              <Input
                id="customerId"
                placeholder="e.g. 100600045"
                value={formData.customerId}
                onChange={(e) => onFieldChangeAction("customerId", e.target.value)}
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
                onChange={(e) => onFieldChangeAction("phone", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="client@example.com"
                value={formData.email}
                onChange={(e) => onFieldChangeAction("email", e.target.value)}
              />
            </div>
          </div>

          {employees && employees.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee Assignment</Label>
              <Select
                value={formData.employeeId || "__none__"}
                onValueChange={(value) => onFieldChangeAction("employeeId", value === "__none__" ? "" : value)}
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
                  onValueChange={(value) => onFieldChangeAction("status", value)}
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
                <Select value={formData.source} onValueChange={(value) => onFieldChangeAction("source", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_SOURCE_VALUES.map((source) => (
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
              <Select value={formData.source} onValueChange={(value) => onFieldChangeAction("source", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_SOURCE_VALUES.map((source) => (
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
              onCheckedChange={(checked) => onFieldChangeAction("onEmailList", checked)}
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
                onSelectAction={(date) => onFieldChangeAction("birthday", date)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Anniversary (optional)</Label>
              <DatePicker
                date={formData.anniversary ?? undefined}
                onSelectAction={(date) => onFieldChangeAction("anniversary", date)}
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
          <ProductsOfInterestInput
            value={productsOfInterest}
            onChangeAction={onProductsChangeAction}
            catalogIndex={catalogIndex}
            isManager={isManager}
          />
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
                onChange={(e) => onNewTagChangeAction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onAddTagAction();
                  }
                }}
              />
              <Button onClick={onAddTagAction} variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {showCommonTags && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Common tags:</p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_TAGS.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                      onClick={() => {
                        if (!formData.tags.includes(tag)) {
                          onFieldChangeAction("tags", [...formData.tags, tag]);
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
              {formData.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="cursor-pointer">
                  {tag}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 ml-1"
                    onClick={() => onRemoveTagAction(tag)}
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
            onChange={(e) => onFieldChangeAction("notes", e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-4 pt-4 border-t">
        <Button variant="outline" onClick={onCancelAction}>
          Cancel
        </Button>
        <Button onClick={onSubmitAction} disabled={isLoading}>
          {isLoading ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
