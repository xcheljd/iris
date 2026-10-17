"use client";

import { Badge } from "@/components/ui/badge";
import { CsvExportDialog } from "@/components/csv-export-dialog";
import { exportClientsCsv } from "@/lib/actions/clients-csv-export";
import { describeClientFilters } from "@/lib/smart-list-filters";
import { LIST_QUERY_LIMIT } from "@/lib/constants";
import type { ClientFilterParams } from "@/lib/client-filter-conds";

interface ClientsCsvExportDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  filters: ClientFilterParams;
}

export function ClientsCsvExportDialog({ open, onOpenChange, filters }: ClientsCsvExportDialogProps) {
  const chips = describeClientFilters(filters);
  return (
    <CsvExportDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export Clients to CSV"
      description="Comma-separated export of clients matching your current filters. Download as a file or copy to clipboard."
      filenamePrefix="clients"
      columns={17}
      emptyText="No matching clients"
      truncatedText={`The export was capped at ${LIST_QUERY_LIMIT.toLocaleString()} rows. Tighten your filters for a complete export.`}
      requestKey={JSON.stringify(filters)}
      fetchCsv={() => exportClientsCsv(filters)}
    >
      {chips.length > 0 && (
        <div className="rounded-md border bg-muted/30 p-3 text-xs">
          <div className="text-muted-foreground mb-1.5">Filtered by:</div>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <Badge key={chip} variant="secondary" className="font-normal">{chip}</Badge>
            ))}
          </div>
        </div>
      )}
    </CsvExportDialog>
  );
}
