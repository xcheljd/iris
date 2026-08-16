"use client";
import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { DatePicker } from "@/components/date-picker";
import { logOutreach } from "@/lib/actions";
import { toast } from "sonner";
import { Phone, MessageSquare, Mail, User } from "lucide-react";

type Method = "call" | "text" | "email" | "in-person";

type Props = {
  clientId: string;
  clientName: string;
  trigger?: React.ReactNode;
  templates?: { id: string; name: string; body: string }[];
  defaultMethod?: Method;
  defaultOutcome?: string;
};

export function OutreachLogger({
  clientId,
  clientName,
  trigger,
  templates = [],
  defaultMethod = "call",
  defaultOutcome = "no_answer",
}: Props) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>(defaultMethod);
  const [outcome, setOutcome] = useState<string>(defaultOutcome);
  const [purchasedModel, setPurchasedModel] = useState("");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState<Date | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const [pending, start] = useTransition();

  const quickFollowUpPresets = [
    { label: "Tomorrow", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
    { label: "1 month", days: 30 },
  ];

  function quickPick(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setFollowUp(d);
  }

  function reset() {
    setMethod(defaultMethod); setOutcome(defaultOutcome); setPurchasedModel(""); setNotes(""); setFollowUp(null); setTemplateId("");
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
        outcome: outcome as "no_answer" | "voicemail" | "voicemail_full" | "responded" | "not_interested" | "wants_to_come_in" | "purchased",
        purchasedModel: purchasedModel || undefined,
        notes: notes || undefined,
        followUpDate: followUp ? followUp.toISOString().split("T")[0] : null,
        templateId: templateId || undefined,
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
              onValueChange={(v) => { if (v) setMethod(v as "call" | "text" | "email" | "in-person"); }}
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
              {[
                { v: "no_answer", l: "No answer" },
                { v: "voicemail", l: "Left voicemail" },
                { v: "voicemail_full", l: "VM full" },
                { v: "responded", l: "Responded" },
                { v: "not_interested", l: "Not interested" },
                { v: "wants_to_come_in", l: "Wants to come in" },
                { v: "purchased", l: "Purchased" },
              ].map((o) => (
                <label key={o.v} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-accent/5">
                  <RadioGroupItem value={o.v} />
                  <span>{o.l}</span>
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

          {templates.length > 0 && (method === "text" || method === "email") && (
            <Field>
              <FieldLabel htmlFor="ol-template">Template (optional)</FieldLabel>
              <Select value={templateId} onValueChange={(v) => { setTemplateId(v); const t = templates.find((x) => x.id === v); if (t) setNotes(t.body); }}>
                <SelectTrigger id="ol-template"><SelectValue placeholder="Pick a template..." /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="ol-notes">Notes</FieldLabel>
            <Textarea id="ol-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was said…" rows={3} />
          </Field>

          <Field>
            <FieldLabel>Follow-up date (optional)</FieldLabel>
            <DatePicker date={followUp ?? undefined} onSelectAction={(d) => setFollowUp(d ?? null)} />
            <div className="flex flex-wrap gap-2">
              {quickFollowUpPresets.map((p) => (
                <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => quickPick(p.days)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="gold" onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
