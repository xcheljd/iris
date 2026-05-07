"use client";

import { useState, useTransition, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { analyzeRvxImport, importProspectsFromRvx, type RvxAnalysisResult } from "@/lib/actions";

interface RvxImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "preview" | "importing" | "done";

export function RvxImportDialog({ open, onOpenChange }: RvxImportDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<RvxAnalysisResult | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    onOpenChange(false);
    setStep("upload");
    setCsvText(null);
    setFileName("");
    setAnalysis(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleAnalyze = () => {
    if (!csvText) return;
    startTransition(async () => {
      try {
        const result = await analyzeRvxImport(csvText);
        if (result.parseErrors.length > 0) {
          toast.error(`Parse errors: ${result.parseErrors[0]}`);
        }
        setAnalysis(result);
        setStep("preview");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to analyze file");
      }
    });
  };

  const handleExportDuplicates = () => {
    if (!analysis) return;
    const blob = new Blob([analysis.duplicateCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rvx-duplicates.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    if (!csvText) return;
    setStep("importing");
    startTransition(async () => {
      try {
        const result = await importProspectsFromRvx(csvText);
        setImportedCount(result.importedCount);
        setStep("done");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed");
        setStep("preview");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {step === "upload" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Import RVX Customer Report
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {fileName || "Click to select a CSV file"}
                </p>
                {fileName && <p className="text-xs text-muted-foreground mt-1">{fileName}</p>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleAnalyze} disabled={!csvText || pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Analyze
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && analysis && (
          <>
            <DialogHeader>
              <DialogTitle>Import Preview</DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <AnalysisBadge label="New" count={analysis.newCount} variant="success" />
                <AnalysisBadge label="Already a Client" count={analysis.alreadyClientCount} variant="info" />
                <AnalysisBadge label="Banned" count={analysis.bannedCount} variant="destructive" />
                <AnalysisBadge label="Unsubscribed" count={analysis.unsubscribedCount} variant="warning" />
                <AnalysisBadge label="Deleted" count={analysis.deletedCount} variant="secondary" />
                <AnalysisBadge label="RVX Duplicates" count={analysis.duplicateCount} variant="outline" />
              </div>

              {analysis.duplicateCount > 0 && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleExportDuplicates}>
                  <Download className="h-4 w-4 mr-2" />
                  Export RVX Duplicates CSV
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
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
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
    success: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    destructive: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    secondary: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    outline: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  };

  return (
    <div className={`rounded-md p-3 text-sm ${variantMap[variant]}`}>
      <div className="font-semibold text-lg leading-none">{count}</div>
      <div className="mt-0.5 opacity-80">{label}</div>
    </div>
  );
}
