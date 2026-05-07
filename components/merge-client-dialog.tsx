"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Merge, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClient } from "@/components/client-provider";
import { mergeClients, patchClientFromFormMerge } from "@/lib/actions";
import { toast } from "sonner";
import type { ClientFormData } from "@/components/client-form";

interface MergeableClient {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  anniversary?: string | null;
  customerId?: string | null;
  source?: string | null;
  onEmailList?: boolean;
  notes?: string | null;
  productsOfInterest?: string[];
  tags?: string[];
}

const RESOLVABLE_FIELDS: { key: keyof MergeableClient; label: string }[] = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "birthday", label: "Birthday" },
  { key: "anniversary", label: "Anniversary" },
  { key: "customerId", label: "Customer ID" },
  { key: "source", label: "Source" },
  { key: "onEmailList", label: "On Email List" },
];

function fmtVal(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

function initChoices(a: MergeableClient, b: MergeableClient): Record<string, "a" | "b"> {
  const choices: Record<string, "a" | "b"> = {};
  for (const { key } of RESOLVABLE_FIELDS) {
    const aVal = a[key];
    const bVal = b[key];
    choices[key] = !aVal && bVal ? "b" : "a";
  }
  return choices;
}

type MergePatch = {
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  anniversary?: string | null;
  customerId?: string | null;
  source?: string;
  onEmailList?: boolean;
  notes?: string | null;
  productsOfInterest?: string[];
  tags?: string[];
};

function buildMergePatch(
  a: MergeableClient,
  b: MergeableClient,
  choices: Record<string, "a" | "b">,
  finalNotes: string,
): MergePatch {
  const pick = (key: keyof MergeableClient) =>
    choices[key] === "b" ? b[key] : a[key];
  return {
    firstName: (pick("firstName") as string) || a.firstName,
    lastName: pick("lastName") as string | null,
    phone: pick("phone") as string | null,
    email: pick("email") as string | null,
    birthday: pick("birthday") as string | null,
    anniversary: pick("anniversary") as string | null,
    customerId: pick("customerId") as string | null,
    source: (pick("source") as string) || undefined,
    onEmailList: !!(a.onEmailList || b.onEmailList),
    notes: finalNotes || null,
    productsOfInterest: Array.from(new Set([...(a.productsOfInterest ?? []), ...(b.productsOfInterest ?? [])])),
    tags: Array.from(new Set([...(a.tags ?? []), ...(b.tags ?? [])])),
  };
}

interface ResolutionPanelProps {
  clientA: MergeableClient;
  clientB: MergeableClient;
  labelA: string;
  labelB: string;
  choices: Record<string, "a" | "b">;
  setChoices: React.Dispatch<React.SetStateAction<Record<string, "a" | "b">>>;
  finalNotes: string;
  setFinalNotes: (val: string) => void;
}

function ResolutionPanel({
  clientA,
  clientB,
  labelA,
  labelB,
  choices,
  setChoices,
  finalNotes,
  setFinalNotes,
}: ResolutionPanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[120px_1fr_1fr] gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
        <div>Field</div>
        <div className="truncate">{labelA}</div>
        <div className="truncate">{labelB}</div>
      </div>

      {RESOLVABLE_FIELDS.map(({ key, label }) => {
        const aRaw = clientA[key];
        const bRaw = clientB[key];
        const aFmt = fmtVal(aRaw);
        const bFmt = fmtVal(bRaw);
        const same = aFmt === bFmt;
        return (
          <div key={key} className="grid grid-cols-[120px_1fr_1fr] gap-2 items-start">
            <div className="text-sm text-muted-foreground pt-2">{label}</div>
            <button
              type="button"
              disabled={same}
              className={cn(
                "p-2 rounded border text-left text-sm transition-colors w-full",
                same
                  ? "opacity-50 cursor-default border-border"
                  : choices[key] === "a"
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border hover:bg-muted/30",
              )}
              onClick={() => setChoices((prev) => ({ ...prev, [key]: "a" }))}
            >
              {aFmt}
            </button>
            <button
              type="button"
              disabled={same}
              className={cn(
                "p-2 rounded border text-left text-sm transition-colors w-full",
                same
                  ? "opacity-50 cursor-default border-border"
                  : choices[key] === "b"
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border hover:bg-muted/30",
              )}
              onClick={() => setChoices((prev) => ({ ...prev, [key]: "b" }))}
            >
              {bFmt}
            </button>
          </div>
        );
      })}

      <div className="pt-2 border-t space-y-2">
        <div className="text-sm font-medium">Notes</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground truncate">{labelA}</div>
            <Textarea
              value={clientA.notes ?? ""}
              readOnly
              className="h-20 text-xs bg-muted/30 resize-none"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full text-xs h-7"
              onClick={() => setFinalNotes(clientA.notes ?? "")}
            >
              Use this
            </Button>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground truncate">{labelB}</div>
            <Textarea
              value={clientB.notes ?? ""}
              readOnly
              className="h-20 text-xs bg-muted/30 resize-none"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full text-xs h-7"
              onClick={() => setFinalNotes(clientB.notes ?? "")}
            >
              Use this
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Final Notes</Label>
          <Textarea
            value={finalNotes}
            onChange={(e) => setFinalNotes(e.target.value)}
            className="h-20 text-sm resize-none"
            placeholder="Edit the combined notes…"
          />
        </div>
      </div>

      <div className="pt-2 border-t space-y-3">
        <div>
          <div className="text-sm font-medium mb-1">Products of Interest (combined)</div>
          <div className="flex flex-wrap gap-1">
            {Array.from(
              new Set([...(clientA.productsOfInterest ?? []), ...(clientB.productsOfInterest ?? [])]),
            ).map((p) => (
              <Badge key={p} variant="outline" className="text-xs">
                {p}
              </Badge>
            ))}
            {!clientA.productsOfInterest?.length && !clientB.productsOfInterest?.length && (
              <span className="text-xs text-muted-foreground">None</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium mb-1">Tags (combined)</div>
          <div className="flex flex-wrap gap-1">
            {Array.from(
              new Set([...(clientA.tags ?? []), ...(clientB.tags ?? [])]),
            ).map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">
                {t}
              </Badge>
            ))}
            {!clientA.tags?.length && !clientB.tags?.length && (
              <span className="text-xs text-muted-foreground">None</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Entry point 1: from the client detail actions menu
export function MergeClientDialog({ children }: { children: React.ReactNode }) {
  const client = useClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"search" | "resolve">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; firstName: string; lastName?: string | null; phone?: string | null }[]
  >([]);
  const [candidateClient, setCandidateClient] = useState<MergeableClient | null>(null);
  const [choices, setChoices] = useState<Record<string, "a" | "b">>({});
  const [finalNotes, setFinalNotes] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) {
      setStep("search");
      setQuery("");
      setResults([]);
      setCandidateClient(null);
      setChoices({});
      setFinalNotes("");
    }
  }, [open]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then(
          (
            data: {
              id: string;
              firstName: string;
              lastName?: string | null;
              phone?: string | null;
            }[],
          ) => setResults(data.filter((r) => r.id !== client?.id)),
        )
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query, client?.id]);

  const handleSelectCandidate = async (candidateId: string) => {
    const res = await fetch(`/api/clients/${candidateId}`);
    const data: MergeableClient = await res.json();
    setCandidateClient(data);
    if (client) {
      setChoices(initChoices(client as MergeableClient, data));
      setFinalNotes(client.notes ?? data.notes ?? "");
    }
    setStep("resolve");
  };

  const handleMerge = () => {
    if (!client || !candidateClient) return;
    start(async () => {
      try {
        const { winnerId } = await mergeClients(
          client.id,
          candidateClient.id,
          choices,
          finalNotes || null,
        );
        toast.success("Clients merged successfully");
        setOpen(false);
        router.push(`/clients/${winnerId}`);
      } catch {
        toast.error("Failed to merge clients");
      }
    });
  };

  if (!client) return <>{children}</>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)} className="contents">
        {children}
      </div>
      <DialogContent className="max-w-2xl flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge Client
          </DialogTitle>
          <DialogDescription>
            {step === "search"
              ? `Find the duplicate record to merge with ${client.firstName} ${client.lastName ?? ""}.`
              : "Choose the winning value for each conflicting field. Outreach history, tags, and products will be combined."}
          </DialogDescription>
        </DialogHeader>

        {step === "search" ? (
          <div className="space-y-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, phone, or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            {results.length > 0 && (
              <div className="border rounded-lg divide-y overflow-y-auto max-h-60">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="w-full text-left p-3 hover:bg-muted/50 flex items-center justify-between gap-2"
                    onClick={() => handleSelectCandidate(r.id)}
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {r.firstName} {r.lastName ?? ""}
                      </div>
                      {r.phone && (
                        <div className="text-xs text-muted-foreground">{r.phone}</div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {query.length >= 2 && results.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No clients found</p>
            )}
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0 py-2">
            <div className="pr-4">
              {candidateClient && (
                <ResolutionPanel
                  clientA={client as MergeableClient}
                  clientB={candidateClient}
                  labelA={`${client.firstName} ${client.lastName ?? ""} (this client)`}
                  labelB={`${candidateClient.firstName} ${candidateClient.lastName ?? ""}`}
                  choices={choices}
                  setChoices={setChoices}
                  finalNotes={finalNotes}
                  setFinalNotes={setFinalNotes}
                />
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="pt-2 border-t">
          {step === "resolve" && (
            <Button type="button" variant="outline" onClick={() => setStep("search")}>
              Back
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {step === "resolve" && (
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={handleMerge}
            >
              {pending ? "Merging…" : "Merge & Delete Duplicate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Entry point 2: from the duplicate detection flow on the new client form
export function MergeFromFormDialog({
  existingClientId,
  formData,
  productsOfInterest,
  open,
  onOpenChange,
  onMerged,
}: {
  existingClientId: string;
  formData: ClientFormData;
  productsOfInterest: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: (winnerId: string) => void;
}) {
  const [existingClient, setExistingClient] = useState<MergeableClient | null>(null);
  const [choices, setChoices] = useState<Record<string, "a" | "b">>({});
  const [finalNotes, setFinalNotes] = useState("");
  const [pending, start] = useTransition();

  const toDateStr = (v: Date | string | null | undefined): string | null => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString().split("T")[0];
    return v;
  };

  const formSnapshot: MergeableClient = {
    id: "new",
    firstName: formData.firstName,
    lastName: formData.lastName || null,
    phone: formData.phone || null,
    email: formData.email || null,
    birthday: toDateStr(formData.birthday),
    anniversary: toDateStr(formData.anniversary),
    customerId: formData.customerId || null,
    source: formData.source || undefined,
    onEmailList: formData.onEmailList,
    notes: formData.notes || null,
    productsOfInterest,
    tags: formData.tags,
  };

  useEffect(() => {
    if (!open || !existingClientId) return;
    fetch(`/api/clients/${existingClientId}`)
      .then((r) => r.json())
      .then((data: MergeableClient) => {
        setExistingClient(data);
        setChoices(initChoices(data, formSnapshot));
        setFinalNotes(data.notes ?? formSnapshot.notes ?? "");
      })
      .catch(() => {});
  // formSnapshot is stable for a given open session; only re-fetch on id change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingClientId]);

  const handleMerge = () => {
    if (!existingClient) return;
    start(async () => {
      try {
        const patch = buildMergePatch(existingClient, formSnapshot, choices, finalNotes);
        await patchClientFromFormMerge(existingClientId, patch);
        toast.success("Records merged successfully");
        onOpenChange(false);
        onMerged(existingClientId);
      } catch {
        toast.error("Failed to merge records");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge with Existing Record
          </DialogTitle>
          <DialogDescription>
            Choose the winning value for each conflicting field. Products and tags will be combined.
          </DialogDescription>
        </DialogHeader>

        {!existingClient ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ScrollArea className="flex-1 min-h-0 py-2">
            <div className="pr-4">
              <ResolutionPanel
                clientA={existingClient}
                clientB={formSnapshot}
                labelA={`${existingClient.firstName} ${existingClient.lastName ?? ""} (existing)`}
                labelB="New Entry (form)"
                choices={choices}
                setChoices={setChoices}
                finalNotes={finalNotes}
                setFinalNotes={setFinalNotes}
              />
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="pt-2 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending || !existingClient} onClick={handleMerge}>
            {pending ? "Merging…" : "Merge Records"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
