"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, UserCheck, X, BellOff, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useTransition } from "react";
import { rejectProspect, unsubscribeProspect } from "@/lib/actions";
import { GraduateProspectDialog } from "@/components/graduate-prospect-dialog";
import type { Prospect } from "@/lib/db/schema";
import type { ProspectListRow } from "@/lib/queries";

interface ProspectDetailContentProps {
  prospect: Prospect;
  batchStart: string | null;
  batchEnd: string | null;
  currentUserRole: "manager" | "associate";
}

const STATUS_LABELS: Record<Prospect["status"], string> = {
  active: "Active",
  graduated: "Graduated",
  unsubscribed: "Unsubscribed",
  rejected: "Rejected",
};

const STATUS_VARIANTS: Record<Prospect["status"], "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  graduated: "secondary",
  unsubscribed: "outline",
  rejected: "destructive",
};

function toProspectListRow(p: Prospect): ProspectListRow {
  return {
    id: p.id,
    rvxCustomerId: p.rvxCustomerId,
    rvxStoreId: p.rvxStoreId,
    rvxSpend: p.rvxSpend,
    firstName: p.firstName,
    lastName: p.lastName,
    phone: p.phone,
    email: p.email,
    status: p.status,
    productsOfInterest: p.productsOfInterest,
    notes: p.notes,
    birthday: p.birthday,
    anniversary: p.anniversary,
    importBatchId: p.importBatchId,
    createdAt: p.createdAt,
  };
}

export function ProspectDetailContent({
  prospect,
  batchStart,
  batchEnd,
  currentUserRole: _currentUserRole,
}: ProspectDetailContentProps) {
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleReject = () => {
    startTransition(async () => {
      try {
        await rejectProspect(prospect.id);
        toast.success("Prospect rejected");
      } catch {
        toast.error("Failed to reject prospect");
      }
    });
  };

  const handleUnsubscribe = () => {
    startTransition(async () => {
      const result = await unsubscribeProspect(prospect.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Prospect unsubscribed");
      }
    });
  };

  const isActive = prospect.status === "active";

  return (
    <div className="flex-1 p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/prospects">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Prospects
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">
            {prospect.firstName} {prospect.lastName ?? ""}
          </h1>
          <Badge variant={STATUS_VARIANTS[prospect.status]} className="mt-1">
            {STATUS_LABELS[prospect.status]}
          </Badge>
        </div>
        {isActive && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => setGraduateOpen(true)} disabled={pending}>
              <UserCheck className="h-4 w-4 mr-2" />
              Graduate to Client
            </Button>
            <Button size="sm" variant="outline" onClick={handleUnsubscribe} disabled={pending}>
              <BellOff className="h-4 w-4 mr-2" />
              Unsubscribe
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={handleReject}
              disabled={pending}
            >
              <X className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Phone" value={prospect.phone} />
            <DetailRow label="Email" value={prospect.email} />
            <DetailRow label="Birthday" value={prospect.birthday} />
            <DetailRow label="Anniversary" value={prospect.anniversary} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">RVX Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Customer ID" value={prospect.rvxCustomerId} />
            <DetailRow label="Store" value={prospect.rvxStoreId} />
            {prospect.rvxSpend !== null && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-28 shrink-0">Spend</span>
                <span className="flex items-center gap-0.5 font-medium">
                  <DollarSign className="h-3.5 w-3.5" />
                  {prospect.rvxSpend.toFixed(2)}
                </span>
              </div>
            )}
            {batchStart && batchEnd && (
              <DetailRow
                label="Report Period"
                value={`${new Date(batchStart).toLocaleDateString()} – ${new Date(batchEnd).toLocaleDateString()}`}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {(prospect.productsOfInterest.length > 0 || prospect.notes) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {prospect.productsOfInterest.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1.5">Models of Interest</p>
                <div className="flex flex-wrap gap-1.5">
                  {prospect.productsOfInterest.map((p) => (
                    <Badge key={p} variant="secondary">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {prospect.notes && (
              <div>
                <p className="text-sm font-medium mb-1">Notes</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{prospect.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <GraduateProspectDialog
        prospect={toProspectListRow(prospect)}
        open={graduateOpen}
        onOpenChange={setGraduateOpen}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span>{value}</span>
    </div>
  );
}
