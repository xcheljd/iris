"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { ProductOfInterest } from "@/lib/db/schema";

function productKey(p: ProductOfInterest) {
  return `${(p.model ?? "").toUpperCase()}|${(p.collection ?? "").toUpperCase()}`;
}

function describeProduct(p: ProductOfInterest) {
  if (p.model && p.collection) return `${p.model} — ${p.collection}`;
  return p.model ?? p.collection ?? "";
}

function dedupeProducts(list: ProductOfInterest[]): ProductOfInterest[] {
  const seen = new Set<string>();
  const out: ProductOfInterest[] = [];
  for (const p of list) {
    const k = productKey(p);
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  }
  return out;
}

export interface MergeableClient {
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
  productsOfInterest?: ProductOfInterest[];
  tags?: string[];
}

export type MergePatch = {
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
  productsOfInterest?: ProductOfInterest[];
  tags?: string[];
};

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

export function initChoices(a: MergeableClient, b: MergeableClient): Record<string, "a" | "b"> {
  const choices: Record<string, "a" | "b"> = {};
  for (const { key } of RESOLVABLE_FIELDS) {
    const aVal = a[key];
    const bVal = b[key];
    choices[key] = !aVal && bVal ? "b" : "a";
  }
  return choices;
}

export function buildMergePatch(
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
    productsOfInterest: dedupeProducts([...(a.productsOfInterest ?? []), ...(b.productsOfInterest ?? [])]),
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

export function ResolutionPanel({
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
              aria-pressed={choices[key] === "a"}
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
              aria-pressed={choices[key] === "b"}
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

      <Separator />
      <div className="space-y-2">
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

      <Separator />
      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium mb-1">Products of Interest (combined)</div>
          <div className="flex flex-wrap gap-1">
            {dedupeProducts([
              ...(clientA.productsOfInterest ?? []),
              ...(clientB.productsOfInterest ?? []),
            ]).map((p) => (
              <Badge key={productKey(p)} variant="outline" className="text-xs">
                {describeProduct(p)}
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
