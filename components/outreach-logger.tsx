"use client";
import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { DatePicker } from "@/components/date-picker";
import { FollowUpQuickPicks } from "@/components/follow-up-quick-picks";
import { logOutreach } from "@/lib/actions";
import { toDateOnly } from "@/lib/utils";
import { toast } from "sonner";
import { OUTCOME_LABELS } from "@/lib/outreach-helpers";
import { OUTREACH_OUTCOME_VALUES, type OutreachOutcome } from "@/lib/db/schema";
import { Phone, MessageSquare, Mail, User } from "lucide-react";

type Method = "call" | "text" | "email" | "in-person";

type Props = {
  clientId: string;
  clientName: string;
  trigger?: React.ReactNode;
  defaultMethod?: Method;
  defaultOutcome?: string;
};

export function OutreachLogger({
  clientId,
  clientName,
  trigger,
  defaultMethod = "call",
  defaultOutcome = "no_answer",
}: Props) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>(defaultMethod);
  const [outcome, setOutcome] = useState<string>(defaultOutcome);
  const [purchasedModel, setPurchasedModel] = useState("");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState<Date | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setMethod(defaultMethod); setOutcome(defaultOutcome); setPurchasedModel(""); setNotes(""); setFollowUp(null);
  }

  function submit() {
    if (outcome === "purchased" && !purchasedModel.trim()) {
      toast.error("Enter the model purchased before saving");
      return;
    }
    start(async () => {
      const result = await logOutreach({
        clientId,
        method,
        outcome: outcome as OutreachOutcome,
        purchasedModel: purchasedModel || undefined,
        notes: notes || undefined,
        // toDateOnly, not toISOString(): the picker hands back a local-midnight
        // Date, whose UTC date part is a day early east of Greenwich.
        followUpDate: toDateOnly(followUp),
      });
      if (result?.error) { toast.error(result.error); return; }
      toast.success("Outreach logged");
      reset();
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button variant="gold" size="sm"><Phone className="size-3.5 mr-1.5" />Log Outreach</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Log outreach — {clientName}</DialogTitle>
          <DialogDescription>Log an outreach interaction with this client.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4 py-2 overflow-y-auto -mx-6 px-6 flex-1">
          <FieldSet>
            <FieldLegend variant="label">Method</FieldLegend>
            <ToggleGroup
              type="single"
              value={method}
              onValueChange={(v) => { if (v) setMethod(v as Method); }}
              variant="outline"
              className="grid grid-cols-4 gap-2"
            >
              {([
                { v: "call", label: "Call", I: Phone },
                { v: "text", label: "Text", I: MessageSquare },
                { v: "email", label: "Email", I: Mail },
                { v: "in-person", label: "In-person", I: User },
              ] as const).map((m) => (
                <ToggleGroupItem key={m.v} value={m.v} className="flex-col h-auto py-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  <m.I className="size-4 mb-1" />
                  <span className="text-xs">{m.label}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">Outcome</FieldLegend>
            <RadioGroup value={outcome} onValueChange={setOutcome} className="grid grid-cols-2 gap-1">
              {OUTREACH_OUTCOME_VALUES.map((v) => (
                <label key={v} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-accent/5">
                  <RadioGroupItem value={v} />
                  <span>{OUTCOME_LABELS[v]}</span>
                </label>
              ))}
            </RadioGroup>
          </FieldSet>

          {outcome === "purchased" && (
            <Field>
              <FieldLabel htmlFor="ol-purchasedModel">Model purchased</FieldLabel>
              <Input id="ol-purchasedModel" value={purchasedModel} onChange={(e) => setPurchasedModel(e.target.value)} placeholder="KX1023-01X" />
            </Field>
          )}


          <Field>
            <FieldLabel htmlFor="ol-notes">Notes</FieldLabel>
            <Textarea id="ol-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was said…" rows={3} />
          </Field>

          <Field>
            <FieldLabel>Follow-up date (optional)</FieldLabel>
            <DatePicker date={followUp ?? undefined} onSelectAction={(d) => setFollowUp(d ?? null)} noPastDays />
            <FollowUpQuickPicks onPick={setFollowUp} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
