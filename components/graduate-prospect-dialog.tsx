"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { UserCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { graduateProspect, graduateProspectIntoExistingClient } from "@/lib/actions";
import type { ProspectListRow } from "@/lib/queries";
import type { ProductOfInterest } from "@/lib/db/schema";
import { ProductsOfInterestInput } from "@/components/products-of-interest-input";
import { useCatalog } from "@/components/use-catalog";

interface GraduateProspectDialogProps {
  prospect: ProspectListRow;
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}

type Step = "enrich" | "duplicate";

export function GraduateProspectDialog({
  prospect,
  open,
  onOpenChangeAction,
}: GraduateProspectDialogProps) {
  const [step, setStep] = useState<Step>("enrich");
  const [pending, startTransition] = useTransition();

  const [firstName, setFirstName] = useState(prospect.firstName);
  const [lastName, setLastName] = useState(prospect.lastName ?? "");
  const [phone, setPhone] = useState(prospect.phone ?? "");
  const [email, setEmail] = useState(prospect.email ?? "");
  const [birthday, setBirthday] = useState(prospect.birthday ?? "");
  const [anniversary, setAnniversary] = useState(prospect.anniversary ?? "");
  const [notes, setNotes] = useState(prospect.notes ?? "");
  const [preferredContact, setPreferredContact] = useState<"" | "call" | "text" | "email">("");
  const [productsOfInterest, setProductsOfInterest] = useState<ProductOfInterest[]>([]);
  const { catalogIndex, isManager } = useCatalog();

  const [duplicateClientId, setDuplicateClientId] = useState("");
  const [duplicateClientName, setDuplicateClientName] = useState("");

  const handleClose = () => {
    onOpenChangeAction(false);
    setStep("enrich");
  };

  const handleGraduate = () => {
    if (!firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    if (!lastName.trim()) {
      toast.error("Last name is required");
      return;
    }
    if (!preferredContact) {
      toast.error("Preferred contact method is required");
      return;
    }
    startTransition(async () => {
      try {
        const result = await graduateProspect({
          prospectId: prospect.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          preferredContact: preferredContact as "call" | "text" | "email",
          phone: phone.trim() || null,
          email: email.trim() || null,
          birthday: birthday.trim() || null,
          anniversary: anniversary.trim() || null,
          notes: notes.trim() || null,
          productsOfInterest,
        });
        if (result.type === "created") {
          toast.success("Prospect graduated to client");
          handleClose();
        } else if (result.type === "duplicate") {
          setDuplicateClientId(result.existingClientId);
          setDuplicateClientName(result.existingClientName);
          setStep("duplicate");
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Failed to graduate prospect");
      }
    });
  };

  const handleGraduateIntoExisting = () => {
    startTransition(async () => {
      const result = await graduateProspectIntoExistingClient(prospect.id, duplicateClientId, {
        preferredContact: preferredContact || undefined,
        phone: phone.trim() || null,
        email: email.trim() || null,
        birthday: birthday.trim() || null,
        anniversary: anniversary.trim() || null,
        notes: notes.trim() || null,
        productsOfInterest,
      });
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Prospect graduated into ${duplicateClientName}`);
        handleClose();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {step === "enrich" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="size-5" />
                Graduate to Client
              </DialogTitle>
            </DialogHeader>

            <FieldGroup className="gap-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="grad-firstName">First Name *</FieldLabel>
                  <Input id="grad-firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="grad-lastName">Last Name *</FieldLabel>
                  <Input id="grad-lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="grad-preferredContact">Preferred Contact *</FieldLabel>
                <Select value={preferredContact || undefined} onValueChange={(v) => setPreferredContact(v as "call" | "text" | "email")}>
                  <SelectTrigger id="grad-preferredContact"><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="grad-phone">Phone</FieldLabel>
                  <Input id="grad-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="grad-email">Email</FieldLabel>
                  <Input id="grad-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="grad-birthday">Birthday</FieldLabel>
                  <Input
                    id="grad-birthday"
                    placeholder="MM/DD"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="grad-anniversary">Anniversary</FieldLabel>
                  <Input
                    id="grad-anniversary"
                    placeholder="MM/DD"
                    value={anniversary}
                    onChange={(e) => setAnniversary(e.target.value)}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel>Products of Interest</FieldLabel>
                {(prospect.productsOfInterest?.length ?? 0) > 0 && (
                  <FieldDescription>
                    From prospect record (reference): {prospect.productsOfInterest.join(", ")}
                  </FieldDescription>
                )}
                <ProductsOfInterestInput
                  value={productsOfInterest}
                  onChangeAction={setProductsOfInterest}
                  catalogIndex={catalogIndex}
                  isManager={isManager}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="grad-notes">Notes</FieldLabel>
                <Textarea
                  id="grad-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes..."
                />
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={handleGraduate} disabled={pending}>
                <UserCheck className="size-4 mr-2" />
                Graduate
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "duplicate" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="size-5 text-amber-500" />
                Existing Client Found
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col py-4 gap-3">
              <p className="text-sm text-muted-foreground">
                A client matching this contact info already exists:
              </p>
              <div className="rounded-lg border p-3 bg-muted/50">
                <p className="font-medium">{duplicateClientName}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Graduating into this client will backfill any empty fields without overwriting existing data.
              </p>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setStep("enrich")} disabled={pending}>
                Back
              </Button>
              <Button onClick={handleGraduateIntoExisting} disabled={pending}>
                Graduate into {duplicateClientName}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
