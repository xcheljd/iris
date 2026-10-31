"use client";

import { useState } from "react";
import { CsvExportDialog, type CsvScopeOption } from "@/components/csv-export-dialog";
import { exportCollectionsCsv, type CollectionsCsvScope } from "@/lib/actions/collections-csv-export";
import { LIST_QUERY_LIMIT } from "@/lib/constants";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  selectedCollection: string | null;
  searchQuery: string;
}

type Mode = CollectionsCsvScope["mode"];

export function CollectionsCsvExportDialog({ open, onOpenChange, selectedCollection, searchQuery }: Props) {
  const trimmedQuery = searchQuery.trim();
  const options: CsvScopeOption<Mode>[] = [{ mode: "all", label: "All collections" }];
  if (selectedCollection) options.push({ mode: "selected", label: `Selected: ${selectedCollection}` });
  if (trimmedQuery) options.push({ mode: "filter", label: `Current filter: "${trimmedQuery}"` });

  const [mode, setMode] = useState<Mode>("all");
  // Fall back to "all" whenever the chosen mode is no longer offered.
  const effectiveMode: Mode = options.some((o) => o.mode === mode) ? mode : "all";
  const scope: CollectionsCsvScope =
    effectiveMode === "selected" && selectedCollection ? { mode: "selected", collection: selectedCollection }
    : effectiveMode === "filter" && trimmedQuery ? { mode: "filter", query: trimmedQuery }
    : { mode: "all" };

  return (
    <CsvExportDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export Collection Interest to CSV"
      description="One row per client · collection · model. Download as a file or copy to clipboard."
      filenamePrefix="collections"
      columns={8}
      emptyText="No collection interest matches this scope"
      truncatedText={`Capped at ${LIST_QUERY_LIMIT.toLocaleString()} clients. Narrow the scope for a complete export.`}
      requestKey={JSON.stringify(scope)}
      fetchCsv={() => exportCollectionsCsv(scope)}
      scope={{ options, value: effectiveMode, onChange: setMode, idPrefix: "coll-export" }}
    />
  );
}
