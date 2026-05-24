"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Trash2, Mail, MessageCircle, File, MoreHorizontal } from "lucide-react";
import { createTemplate, deleteTemplate } from "@/lib/actions";
import { toast } from "sonner";

const getChannelIcon = (channel: string) => {
  switch (channel) {
    case "text": return <MessageCircle className="h-4 w-4" />;
    case "email": return <Mail className="h-4 w-4" />;
    default: return <File className="h-4 w-4" />;
  }
};

interface TemplatesTabProps {
  templates: { id: string; name: string; body: string; subject: string | null; channel: string }[];
  isManager: boolean;
}

export function TemplatesTab({ templates: initialTemplates, isManager }: TemplatesTabProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [showDialog, setShowDialog] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    body: "",
    subject: "",
    channel: "general" as "text" | "email" | "general",
  });
  const [deleteTarget, setDeleteTarget] = useState<(typeof initialTemplates)[number] | null>(null);

  const handleCreate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    try {
      await createTemplate(newTemplate.name, newTemplate.body, newTemplate.subject || null, newTemplate.channel);
      toast.success("Template created");
      setShowDialog(false);
      setNewTemplate({ name: "", body: "", subject: "", channel: "general" });
      router.refresh();
    } catch {
      toast.error("Failed to create template");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate(id);
      setTemplates(templates.filter((t) => t.id !== id));
      toast.success("Template deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete template");
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Outreach Templates</CardTitle>
              <CardDescription>
                {templates.length} template{templates.length !== 1 ? "s" : ""} for outreach messages
              </CardDescription>
            </div>
            {isManager && (
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Template</DialogTitle>
                  <DialogDescription>Write a reusable outreach message template.</DialogDescription>
                </DialogHeader>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="templateName">Template Name</FieldLabel>
                    <Input id="templateName" placeholder="e.g., Birthday Follow-up" value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="templateChannel">Channel</FieldLabel>
                    <Select value={newTemplate.channel} onValueChange={(value) => setNewTemplate({ ...newTemplate, channel: value as "text" | "email" | "general" })}>
                      <SelectTrigger id="templateChannel"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {newTemplate.channel === "email" && (
                    <Field>
                      <FieldLabel htmlFor="templateSubject">Subject</FieldLabel>
                      <Input id="templateSubject" placeholder="Email subject line..." value={newTemplate.subject} onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })} />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor="templateBody">Body</FieldLabel>
                    <Textarea
                      id="templateBody"
                      placeholder="Template body... Use {{first_name}}, {{last_name}}, {{employee_name}} for personalization"
                      value={newTemplate.body}
                      onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                      rows={6}
                    />
                  </Field>
                </FieldGroup>
                <DialogFooter className="mt-4">
                  <Button onClick={handleCreate} className="w-full">Create Template</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No templates created"
              description="Create templates for faster outreach"
            />
          ) : (
            <div className="space-y-4">
              {templates.map((template) => (
                <Card key={template.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getChannelIcon(template.channel)}
                          <span className="font-medium">{template.name}</span>
                          <Badge variant="outline" className="capitalize text-xs">
                            {template.channel}
                          </Badge>
                        </div>
                        {template.subject && (
                          <p className="text-sm text-muted-foreground mb-1">
                            Subject: {template.subject}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {template.body}
                        </p>
                      </div>
                      {isManager && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" aria-label="Template actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(template)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isManager && (
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChangeAction={(open) => !open && setDeleteTarget(null)}
        title="Delete Template"
        description={<>Are you sure you want to delete the <strong>{deleteTarget?.name}</strong> template? This action cannot be undone.</>}
        confirmLabel="Delete"
        onConfirmAction={() => deleteTarget && handleDelete(deleteTarget.id)}
        variant="destructive"
      />
      )}
    </>
  );
}
