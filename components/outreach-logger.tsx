"use client";
import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  const [followUp, setFollowUp] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [pending, start] = useTransition();

  function reset() {
    setMethod("call"); setOutcome("no_answer"); setPurchasedModel(""); setNotes(""); setFollowUp(""); setTemplateId("");
  }

  function submit() {
    start(async () => {
      await logOutreach({
        clientId,
        method,
        outcome: outcome as "no_answer" | "voicemail" | "voicemail_full" | "responded" | "not_interested" | "wants_to_come_in" | "purchased",
        purchasedModel: purchasedModel || undefined,
        notes: notes || undefined,
        followUpDate: followUp || null,
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
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Log outreach — {clientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Method</Label>
            <div className="grid grid-cols-4 gap-2">
              {([
                { v: "call", label: "Call", I: Phone },
                { v: "text", label: "Text", I: MessageSquare },
                { v: "email", label: "Email", I: Mail },
                { v: "in-person", label: "In-person", I: User },
              ] as const).map((m) => (
                <Button key={m.v} type="button" variant={method === m.v ? "default" : "outline"} size="sm" className="flex-col h-auto py-2" onClick={() => setMethod(m.v)}>
                  <m.I className="h-4 w-4 mb-1" />
                  <span className="text-xs">{m.label}</span>
                </Button>
              ))}
            </div>
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
            <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
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
