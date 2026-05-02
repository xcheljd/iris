"use client";
import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DatePicker } from "@/components/date-picker";
import { logOutreach } from "@/lib/actions";
import { toast } from "sonner";
import { Phone, MessageSquare, Mail, User } from "lucide-react";

type Props = {
  clientId: string;
  clientName: string;
  trigger?: React.ReactNode;
  templates?: { id: string; name: string; body: string }[];
};

export function OutreachLogger({ clientId, clientName, trigger, templates = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"call" | "text" | "email" | "in-person">("call");
  const [outcome, setOutcome] = useState<string>("no_answer");
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
    setMethod("call"); setOutcome("no_answer"); setPurchasedModel(""); setNotes(""); setFollowUp(null); setTemplateId("");
  }

  function submit() {
    start(async () => {
      await logOutreach({
        clientId,
        method,
        outcome: outcome as "no_answer" | "voicemail" | "voicemail_full" | "responded" | "not_interested" | "wants_to_come_in" | "purchased",
        purchasedModel: purchasedModel || undefined,
        notes: notes || undefined,
        followUpDate: followUp ? followUp.toISOString().split("T")[0] : null,
        templateId: templateId || undefined,
      });
      toast.success("Outreach logged");
      reset();
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button variant="gold" size="sm"><Phone className="h-3.5 w-3.5 mr-1.5" />Log Outreach</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log outreach — {clientName}</DialogTitle>
          <DialogDescription>Log an outreach interaction with this client.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Method</Label>
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
                  <m.I className="h-4 w-4 mb-1" />
                  <span className="text-xs">{m.label}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label>Outcome</Label>
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
          </div>

          {outcome === "purchased" && (
            <div className="space-y-2">
              <Label>Model purchased</Label>
              <Input value={purchasedModel} onChange={(e) => setPurchasedModel(e.target.value)} placeholder="KX1023-01X" />
            </div>
          )}

          {templates.length > 0 && (method === "text" || method === "email") && (
            <div className="space-y-2">
              <Label>Template (optional)</Label>
              <Select value={templateId} onValueChange={(v) => { setTemplateId(v); const t = templates.find((x) => x.id === v); if (t) setNotes(t.body); }}>
                <SelectTrigger><SelectValue placeholder="Pick a template..." /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was said…" rows={3} />
          </div>

          <div className="space-y-2">
            <Label>Follow-up date (optional)</Label>
            <DatePicker date={followUp ?? undefined} onSelect={(d) => setFollowUp(d ?? null)} />
            <div className="flex flex-wrap gap-2">
              {quickFollowUpPresets.map((p) => (
                <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => quickPick(p.days)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="gold" onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
