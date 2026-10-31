"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { DatePicker } from "@/components/date-picker";
import { Plus, AlertCircle } from "lucide-react";

import { CLIENT_SOURCE_VALUES, type ProductOfInterest } from "@/lib/db/schema";
import { ProductsOfInterestInput } from "@/components/products-of-interest-input";
import { TagPicker } from "@/components/tag-picker";
import { useTagOptions } from "@/components/use-tag-options";
import { tagKey } from "@/lib/tag-names";
import type { CatalogEntry } from "@/lib/actions/model-catalog";
import type { DuplicateResult } from "@/lib/duplicate-client";

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
  notes: string;
  tags: string[];
}

interface ClientFormProps {
  formData: ClientFormData;
  productsOfInterest: ProductOfInterest[];
  catalogIndex?: Record<string, CatalogEntry> | null;
  isManager?: boolean;
  onFieldChangeAction: (field: string, value: string | boolean | Date | null | undefined | string[]) => void;
  onProductsChangeAction: (next: ProductOfInterest[]) => void;
  // Duplicate warning
  showDuplicateWarning: boolean;
  duplicateClient: DuplicateResult | null;
  onDismissDuplicateAction: () => void;
  onEditExistingAction: () => void;
  onMergeWithDuplicateAction?: () => void;
  // Edit-only
  employees?: { id: string; name: string; role: string }[];
  // Submit
  isLoading: boolean;
  submitLabel: string;
  onSubmitAction: () => void;
  onCancelAction: () => void;
}

export function ClientForm({
  formData,
  productsOfInterest,
  catalogIndex,
  isManager,
  onFieldChangeAction,
  onProductsChangeAction,
  showDuplicateWarning,
  duplicateClient,
  onDismissDuplicateAction,
  onEditExistingAction,
  onMergeWithDuplicateAction,
  employees,
  isLoading,
  submitLabel,
  onSubmitAction,
  onCancelAction,
}: ClientFormProps) {
  const tagOptions = useTagOptions();
  const POPULAR = 8;
  const popularTags = tagOptions
    .filter((t) => t.usageCount > 0 && !formData.tags.some((c) => tagKey(c) === tagKey(t.name)))
    .slice(0, POPULAR);
  return (
    <div className="flex flex-col gap-6">
      {/* Duplicate Warning */}
      {showDuplicateWarning && duplicateClient?.duplicate && (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>Potential Duplicate Found</AlertTitle>
          <AlertDescription>
            {duplicateClient.id ? (
              <>
                This client may already exist in the system. Would you like to open the existing record?
                <div className="text-sm mt-2">
                  <strong>Existing client:</strong> {duplicateClient.name}
                </div>
              </>
            ) : (
              "A client with matching details already exists."
            )}
            <div className="flex gap-2 mt-3 flex-wrap">
              {duplicateClient.id && (
                <Button onClick={onEditExistingAction} variant="default" size="sm">
                  Edit Existing
                </Button>
              )}
              {duplicateClient.id && onMergeWithDuplicateAction && (
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
                autoComplete="given-name"
                placeholder="Enter first name"
                value={formData.firstName}
                onChange={(e) => onFieldChangeAction("firstName", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="lastName">Last Name *</FieldLabel>
              <Input
                id="lastName"
                autoComplete="family-name"
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
                  autoComplete="tel"
                  placeholder="(XXX) XXX-XXXX"
                  value={formData.phone}
                  onChange={(e) => onFieldChangeAction("phone", e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  autoComplete="email"
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
            Preferences & Source
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
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
        <CardContent className="flex flex-col gap-3">
          <TagPicker
            value={formData.tags}
            options={tagOptions}
            onAdd={(tag) => onFieldChangeAction("tags", [...formData.tags, tag])}
            onRemove={(tag) => onFieldChangeAction("tags", formData.tags.filter((t) => t !== tag))}
          />
          {/* Most-used tags, one tap to add (from the database, not a fixed list). */}
          {popularTags.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-muted-foreground">Popular tags:</p>
              <div className="flex flex-wrap gap-1.5">
                {popularTags.map((t) => (
                  <Button
                    key={t.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => onFieldChangeAction("tags", [...formData.tags, t.name])}
                  >
                    <Plus className="size-3" />
                    {t.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
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
