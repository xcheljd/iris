"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Merge, ChevronRight, Search } from "lucide-react";
import { useClient } from "@/components/client-provider";
import { mergeClients } from "@/lib/actions";
import { toast } from "sonner";
import { type MergeableClient, initChoices, ResolutionPanel } from "./resolution-panel";

/** One client row from the `/api/search` envelope (`{ hits, prospects, lists, … }`). */
type SearchHit = {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
};

export function MergeClientDialog({ children }: { children: React.ReactNode }) {
  const client = useClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"search" | "resolve">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [candidateClient, setCandidateClient] = useState<MergeableClient | null>(null);
  const [choices, setChoices] = useState<Record<string, "a" | "b">>({});
  const [finalNotes, setFinalNotes] = useState("");
  const [pending, start] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

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
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data: { hits?: SearchHit[] }) =>
          setResults((data.hits ?? []).filter((r) => r.id !== client?.id)),
        )
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          toast.error("Search failed. Please try again.");
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query, client?.id]);

  const handleSelectCandidate = async (candidateId: string) => {
    let data: MergeableClient;
    try {
      const res = await fetch(`/api/clients/${candidateId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch {
      toast.error("Could not load client details");
      return;
    }
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
      const result = await mergeClients(
        client.id,
        candidateClient.id,
        choices,
        finalNotes || null,
      );
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Clients merged successfully");
        setOpen(false);
        router.push(`/clients/${result.winnerId}`);
      }
    });
  };

  if (!client) return <>{children}</>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-2xl flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="size-5" />
            Merge Client
          </DialogTitle>
          <DialogDescription>
            {step === "search"
              ? `Find the duplicate record to merge with ${client.firstName} ${client.lastName ?? ""}.`
              : "Choose the winning value for each conflicting field. Outreach history, tags, and products will be combined."}
          </DialogDescription>
        </DialogHeader>

        {step === "search" ? (
          <div className="flex flex-col gap-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
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
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
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
