"use client";

import { downloadCsv } from "@/lib/download";
import { useState, useTransition, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download, CheckCircle2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { analyzeProspectImport, importProspects, type ProspectImportAnalysis } from "@/lib/actions";
import { PROSPECT_FIELDS } from "@/lib/prospect-import-parser";
import { ImportSource } from "@/components/import/import-source";

interface ProspectImportDialogProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}

type Step = "upload" | "preview" | "importing" | "done";

export function ProspectImportDialog({ open, onOpenChangeAction }: ProspectImportDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProspectImportAnalysis | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [pending, startTransition] = useTransition();

  const handleClose = () => {
    onOpenChangeAction(false);
    setStep("upload");
    setCsvText(null);
    setAnalysis(null);
  };

  // An import in flight can't be abandoned: closing would reset the steps
  // while the server keeps writing.
  const handleOpenChange = (next: boolean) => {
    if (!next && step === "importing") return;
    handleClose();
  };

  const handleSource = useCallback((mapped: string | null) => { setCsvText(mapped); }, []);

  const handleAnalyze = () => {
    if (!csvText) return;
    startTransition(async () => {
      const result = await analyzeProspectImport(csvText);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.parseErrors.length > 0) {
        toast.error(`Parse errors: ${result.parseErrors[0]}`);
      }
      setAnalysis(result);
      setStep("preview");
    });
  };

  const handleExportDuplicates = () => {
    if (!analysis) return;
    downloadCsv(analysis.duplicateCsv, "import-duplicates.csv");
  };

  const handleImport = () => {
    if (!csvText) return;
    setStep("importing");
    startTransition(async () => {
      const result = await importProspects(csvText);
      if ("error" in result) {
        toast.error(result.error);
        setStep("preview");
        return;
      }
      setImportedCount(result.importedCount);
      setStep("done");
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        {/* Kept mounted behind the preview so Back returns to the same input. */}
        <div className={step === "upload" ? "flex flex-col" : "hidden"}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="size-5" />
                Import Prospects
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col py-4 gap-4">
              <ImportSource
                id="prospects"
                fields={PROSPECT_FIELDS}
                hints={{ phone: "any format", customerId: "optional; matches earlier imports" }}
                examples={[["Ada", "Byron", "(555) 010-0141", "ada@example.com", "CUST10001"], ["Sam", "Rivera", "", "sam@example.com", ""]]}
                placeholder={"Ada\tByron\t5550100141\tada@example.com"}
                onChange={handleSource}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleAnalyze} disabled={!csvText || pending}>
                {pending ? <Spinner className="mr-2" /> : null}
                Analyze
              </Button>
            </DialogFooter>
          </div>

        {step === "preview" && analysis && (
          <>
            <DialogHeader>
              <DialogTitle>Import Preview</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col py-4 gap-4">
              <div className="grid grid-cols-2 gap-2">
                <AnalysisBadge label="New" count={analysis.newCount} variant="success" />
                <AnalysisBadge label="Already a Client" count={analysis.alreadyClientCount} variant="info" />
                <AnalysisBadge label="Already a Prospect" count={analysis.alreadyProspectCount} variant="info" />
                <AnalysisBadge label="Banned" count={analysis.bannedCount} variant="destructive" />
                <AnalysisBadge label="Unsubscribed" count={analysis.unsubscribedCount} variant="warning" />
                <AnalysisBadge label="Deleted" count={analysis.deletedCount} variant="secondary" />
                <AnalysisBadge label="Duplicates in File" count={analysis.duplicateCount} variant="outline" />
              </div>

              {analysis.duplicateCount > 0 && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleExportDuplicates}>
                  <Download className="size-4 mr-2" />
                  Export Duplicates CSV
                </Button>
              )}

              {analysis.parseErrors.length > 0 && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {analysis.parseErrors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")} disabled={pending}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={analysis.newCount === 0 || pending}
              >
                Import {analysis.newCount} Prospect{analysis.newCount !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "importing" && (
          <>
            <DialogHeader>
              <DialogTitle>Importing...</DialogTitle>
            </DialogHeader>
            <div className="py-8 flex justify-center">
              <Spinner className="size-8 text-muted-foreground" />
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" />
                Import Complete
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 text-center">
              <p className="text-2xl font-bold">{importedCount}</p>
              <p className="text-muted-foreground">
                prospect{importedCount !== 1 ? "s" : ""} imported
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AnalysisBadge({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: "success" | "info" | "destructive" | "warning" | "secondary" | "outline";
}) {
  const variantMap: Record<string, string> = {
    success: "bg-success/10 text-success",
    info: "bg-info/10 text-info",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/10 text-warning",
    secondary: "bg-muted text-muted-foreground",
    outline: "bg-tone-violet/10 text-tone-violet",
  };

  return (
    <div className={`rounded-md p-3 text-sm ${variantMap[variant]}`}>
      <div className="font-semibold text-lg leading-none">{count}</div>
      <div className="mt-0.5 opacity-80">{label}</div>
    </div>
  );
}
