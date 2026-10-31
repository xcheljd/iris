"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateTimeCell, StatusBadgeCell } from "@/components/data-table/cells";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { PaginationFooter } from "@/components/pagination-footer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, RotateCcw } from "lucide-react";
import { restoreClient, purgeClient } from "@/lib/actions";
import { toast } from "sonner";

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

interface DeletedTabProps {
  deletedClients: { id: string; firstName: string; lastName: string | null; previousStatus: string | null; deletedAt: Date | null }[];
  isManager: boolean;
}

export function DeletedTab({ deletedClients, isManager }: DeletedTabProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [restoreTarget, setRestoreTarget] = useState<(typeof deletedClients)[number] | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<(typeof deletedClients)[number] | null>(null);

  const totalPages = Math.ceil(deletedClients.length / PAGE_SIZE);
  const paged = deletedClients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    const result = await restoreClient(restoreTarget.id);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Client restored");
      setRestoreTarget(null);
      router.refresh();
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    const result = await purgeClient(purgeTarget.id);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Client permanently deleted");
      setPurgeTarget(null);
      router.refresh();
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Deleted Clients</CardTitle>
          <CardDescription>
            {deletedClients.length} deleted client{deletedClients.length !== 1 ? "s" : ""}{isManager ? ". Restore or permanently remove them." : "."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deletedClients.length === 0 ? (
            <EmptyState
              icon={Trash2}
              title="No deleted clients"
              description="Deleted clients will appear here for recovery"
            />
          ) : (
            <>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Previous Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Deleted Date</TableHead>
                  {isManager && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((dc) => (
                  <TableRow key={dc.id}>
                    <TableCell className="font-medium">{dc.firstName} {dc.lastName ?? ""}</TableCell>
                    <StatusBadgeCell
                      label={dc.previousStatus ?? "active"}
                      variant="outline"
                      capitalize
                      className="hidden sm:table-cell"
                    />
                    <DateTimeCell value={dc.deletedAt} className="hidden sm:table-cell text-sm" />
                    {isManager && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => setRestoreTarget(dc)}>
                          <RotateCcw className="size-4 mr-1" />
                          Restore
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setPurgeTarget(dc)}>
                          <Trash2 className="size-4 mr-1" />
                          Purge
                        </Button>
                      </div>
                    </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            <PaginationFooter
              currentPage={page}
              totalPages={totalPages}
              onPageChangeAction={setPage}
              totalItems={deletedClients.length}
              pageSize={PAGE_SIZE}
              itemLabel="clients"
            />
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChangeAction={(open) => !open && setRestoreTarget(null)}
        title="Restore Client"
        description={<>Are you sure you want to restore <strong>{restoreTarget?.firstName} {restoreTarget?.lastName}</strong>? They will reappear in the client list with their previous status.</>}
        confirmLabel="Restore"
        onConfirmAction={handleRestore}
      />

      <ConfirmDialog
        open={!!purgeTarget}
        onOpenChangeAction={(open) => !open && setPurgeTarget(null)}
        title="Permanently Delete Client"
        description={<>Are you sure you want to permanently delete <strong>{purgeTarget?.firstName} {purgeTarget?.lastName}</strong>? This permanently removes the client and all their data. This cannot be undone.</>}
        confirmLabel="Purge"
        variant="destructive"
        onConfirmAction={handlePurge}
      />
    </>
  );
}
