"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarIcon, CheckCircle, Phone, Mail, MessageCircle, User, Copy, Star } from "lucide-react";
import { toast } from "sonner";

interface FollowUpFormProps {
  clientId: string;
  onSuccess?: () => void;
}

interface Template {
  id: string;
  name: string;
  body: string;
  subject?: string;
  channel: string;
}

export function FollowUpForm({ clientId, onSuccess }: FollowUpFormProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const [formData, setFormData] = useState({
    method: "call" as "call" | "text" | "email" | "in-person",
    outcome: "" as string,
    purchasedModel: "",
    notes: "",
    followUpDate: null as Date | null,
  });

  const [templates, setTemplates] = useState<Template[]>([]);

  const quickFollowUpPresets = [
    { label: "Tomorrow", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
    { label: "1 month", days: 30 },
  ];

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/templates");
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    }
  };

  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear purchased model if outcome is not purchased
    if (field === "outcome" && value !== "purchased") {
      setFormData(prev => ({ ...prev, purchasedModel: "" }));
    }
  };

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    setFormData(prev => ({ ...prev, notes: template.body }));
  };

  const personalizeTemplate = () => {
    if (!selectedTemplate) return;

    // This would normally fetch client details to personalize
    const personalized = selectedTemplate.body
      .replace(/{{first_name}}/g, "Client")
      .replace(/{{last_name}}/g, "")
      .replace(/{{employee_name}}/g, "Your Associate")
      .replace(/{{date}}/g, format(new Date(), "MMMM d, yyyy"));

    setFormData(prev => ({ ...prev, notes: personalized }));
  };

  const handleQuickFollowUp = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    handleInputChange("followUpDate", date);
  };

  const handleSubmit = async () => {
    if (!formData.outcome) {
      toast.error("Please select an outcome");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/outreach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          method: formData.method,
          outcome: formData.outcome,
          purchasedModel: formData.outcome === "purchased" ? formData.purchasedModel : null,
          notes: formData.notes,
          followUpDate: formData.followUpDate,
        }),
      });

      if (response.ok) {
        toast.success("Outreach logged successfully");
        setOpen(false);
        setFormData({
          method: "call",
          outcome: "",
          purchasedModel: "",
          notes: "",
          followUpDate: null,
        });
        setSelectedTemplate(null);
        onSuccess?.();
      } else {
        toast.error("Failed to log outreach");
      }
    } catch (error) {
      toast.error("Failed to log outreach");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (formData.notes) {
      navigator.clipboard.writeText(formData.notes);
      toast.success("Notes copied to clipboard");
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case "call": return <Phone className="h-4 w-4" />;
      case "text": return <MessageCircle className="h-4 w-4" />;
      case "email": return <Mail className="h-4 w-4" />;
      case "in-person": return <User className="h-4 w-4" />;
      default: return <MessageCircle className="h-4 w-4" />;
    }
  };

  const outcomes = [
    { value: "no_answer", label: "No answer" },
    { value: "voicemail", label: "Voicemail" },
    { value: "voicemail_full", label: "Voicemail full" },
    { value: "responded", label: "Responded" },
    { value: "not_interested", label: "Not interested" },
    { value: "wants_to_come_in", label: "Wants to come in" },
    { value: "purchased", label: "Purchased" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <CalendarIcon className="h-4 w-4 mr-2" />
          Log Outreach
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log Outreach</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Method Selection */}
          <div className="space-y-2">
            <Label>Method</Label>
            <div className="grid grid-cols-2 gap-2">
              {["call", "text", "email", "in-person"].map((method) => (
                <Button
                  key={method}
                  variant={formData.method === method ? "default" : "outline"}
                  className="capitalize flex items-center gap-2"
                  onClick={() => handleInputChange("method", method)}
                >
                  {getMethodIcon(method)}
                  {method}
                </Button>
              ))}
            </div>
          </div>

          {/* Outcome Selection */}
          <div className="space-y-2">
            <Label>Outcome</Label>
            <Select
              value={formData.outcome}
              onValueChange={(value) => handleInputChange("outcome", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                {outcomes.map((outcome) => (
                  <SelectItem key={outcome.value} value={outcome.value}>
                    {outcome.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Purchased Model */}
          {formData.outcome === "purchased" && (
            <div className="space-y-2">
              <Label>Purchased Model</Label>
              <Input
                placeholder="Enter model number..."
                value={formData.purchasedModel}
                onChange={(e) => handleInputChange("purchasedModel", e.target.value)}
              />
            </div>
          )}

          {/* Follow-up Date */}
          <div className="space-y-2">
            <Label>Follow-up Date (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {formData.followUpDate 
                    ? format(formData.followUpDate, "MMM d, yyyy")
                    : "Set follow-up date"
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                      selected={formData.followUpDate ?? undefined}
                  onSelect={(date) => handleInputChange("followUpDate", date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            
            {/* Quick Presets */}
            <div className="flex flex-wrap gap-2 mt-2">
              {quickFollowUpPresets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickFollowUp(preset.days)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Notes</Label>
              <Button variant="ghost" size="sm" onClick={copyToClipboard} aria-label="Copy notes">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Template Picker */}
            <div className="flex gap-2 mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTemplatePicker(!showTemplatePicker)}
                className="flex items-center gap-1"
              >
                <Star className="h-4 w-4" />
                Templates
              </Button>
              
              {selectedTemplate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={personalizeTemplate}
                  className="flex items-center gap-1"
                >
                  Personalize
                </Button>
              )}
            </div>

            {showTemplatePicker && (
              <div className="border rounded-lg p-2 mb-2 max-h-32 overflow-y-auto">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    className="text-left p-2 hover:bg-muted rounded w-full"
                    onClick={() => handleTemplateSelect(template)}
                  >
                    <div className="font-medium text-sm">{template.name}</div>
                    <div className="text-xs text-muted-foreground">{template.channel}</div>
                  </button>
                ))}
              </div>
            )}

            <Textarea
              placeholder="Add notes about the outreach..."
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Logging..." : "Log Outreach"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}