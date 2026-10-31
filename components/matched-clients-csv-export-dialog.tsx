"use client";

import { useState } from "react";
import { CsvExportDialog, type CsvScopeOption } from "@/components/csv-export-dialog";
import { exportMatchedClientsCsv, type MatchedClientsCsvScope } from "@/lib/actions/matched-clients-csv-export";
import { LIST_QUERY_LIMIT } from "@/lib/constants";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  owners: string[];
  matchTypes: string[];
  brands: string[];
}

type Mode = MatchedClientsCsvScope["mode"];

export function MatchedClientsCsvExportDialog({ open, onOpenChange, owners, matchTypes, brands }: Props) {
  const hasFilter = owners.length > 0 || matchTypes.length > 0 || brands.length > 0;
  const summary = [
    owners.length ? `Assoc: ${owners.join(", ")}` : "",
    matchTypes.length ? `Match: ${matchTypes.join(", ")}` : "",
    brands.length ? `Brand: ${brands.join(", ")}` : "",
  ].filter(Boolean).join(" · ");

  const options: CsvScopeOption<Mode>[] = [{ mode: "all", label: "All matched clients" }];
  if (hasFilter) options.push({ mode: "filter", label: `Current filter (${summary})` });

  const [mode, setMode] = useState<Mode>("all");
  // Fall back to "all" whenever the chosen mode is no longer offered.
  const effectiveMode: Mode = options.some((o) => o.mode === mode) ? mode : "all";
  const scope: MatchedClientsCsvScope =
    effectiveMode === "filter" && hasFilter ? { mode: "filter", owners, matchTypes, brands } : { mode: "all" };

  return (
    <CsvExportDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export Matched Clients to CSV"
      description="One row per client · matched promo. Download as a file or copy to clipboard."
      filenamePrefix="matched-clients"
      columns={13}
      emptyText="No matched clients in this scope"
      truncatedText={`Capped at ${LIST_QUERY_LIMIT.toLocaleString()} rows. Narrow the scope for a complete export.`}
      requestKey={JSON.stringify(scope)}
      fetchCsv={() => exportMatchedClientsCsv(scope)}
      scope={{ options, value: effectiveMode, onChange: setMode, idPrefix: "matched-export" }}
    />
  );
}
