"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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
    <div className="flex flex-col gap-6">
      {/* Duplicate Warning */}
      {showDuplicateWarning && duplicateClient && (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>Potential Duplicate Found</AlertTitle>
          <AlertDescription>
            This client may already exist in the system. Would you like to merge with the existing record?
            <div className="flex flex-col mt-2 gap-1">
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
        <CardContent>
          <FieldGroup className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="firstName">First Name *</FieldLabel>
              <Input
                id="firstName"
                placeholder="Enter first name"
                value={formData.firstName}
                onChange={(e) => onFieldChangeAction("firstName", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="lastName">Last Name *</FieldLabel>
              <Input
                id="lastName"
                placeholder="Enter last name"
                value={formData.lastName}
                onChange={(e) => onFieldChangeAction("lastName", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="preferredContact">Preferred Contact *</FieldLabel>
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
            </Field>
            <Field>
              <FieldLabel htmlFor="customerId">Customer ID</FieldLabel>
              <Input
                id="customerId"
                placeholder="e.g. 100600045"
                value={formData.customerId}
                onChange={(e) => onFieldChangeAction("customerId", e.target.value)}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input
                  id="phone"
                  placeholder="(XXX) XXX-XXXX"
                  value={formData.phone}
                  onChange={(e) => onFieldChangeAction("phone", e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="client@example.com"
                  value={formData.email}
                  onChange={(e) => onFieldChangeAction("email", e.target.value)}
                />
              </Field>
            </div>

            {employees && employees.length > 0 && (
              <Field>
                <FieldLabel htmlFor="employeeId">Employee Assignment</FieldLabel>
                <Select
                  value={formData.employeeId || "__none__"}
                  onValueChange={(value) => onFieldChangeAction("employeeId", value === "__none__" ? "" : value)}
                >
                  <SelectTrigger id="employeeId">
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
              </Field>
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Status & Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>
            {formData.status !== undefined ? "Status & Preferences" : "Preferences & Source"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            {formData.status !== undefined && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="status">Status</FieldLabel>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => onFieldChangeAction("status", value)}
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="banned">Banned</SelectItem>
                      <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="source">Source</FieldLabel>
                  <Select value={formData.source} onValueChange={(value) => onFieldChangeAction("source", value)}>
                    <SelectTrigger id="source">
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
                </Field>
              </div>
            )}

            {formData.status === undefined && (
              <Field>
                <FieldLabel htmlFor="source">Source</FieldLabel>
                <Select value={formData.source} onValueChange={(value) => onFieldChangeAction("source", value)}>
                  <SelectTrigger id="source">
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
              </Field>
            )}

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="onEmailList">Email List</FieldLabel>
                <FieldDescription>Add client to email marketing list</FieldDescription>
              </FieldContent>
              <Switch
                id="onEmailList"
                checked={formData.onEmailList}
                onCheckedChange={(checked) => onFieldChangeAction("onEmailList", checked)}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Important Dates */}
      <Card>
        <CardHeader>
          <CardTitle>Important Dates</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Birthday (optional)</FieldLabel>
              <DatePicker
                date={formData.birthday ?? undefined}
                onSelectAction={(date) => onFieldChangeAction("birthday", date)}
                className="w-full"
              />
            </Field>
            <Field>
              <FieldLabel>Anniversary (optional)</FieldLabel>
              <DatePicker
                date={formData.anniversary ?? undefined}
                onSelectAction={(date) => onFieldChangeAction("anniversary", date)}
                className="w-full"
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Products of Interest */}
      <Card>
        <CardHeader>
          <CardTitle>Products of Interest</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
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
                <Plus className="size-4" />
              </Button>
            </div>

            {showCommonTags && (
              <div className="flex flex-col gap-2">
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
                    className="size-5 ml-1"
                    onClick={() => onRemoveTagAction(tag)}
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X className="size-3" />
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
      <Separator />
      <div className="flex justify-end gap-4">
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
