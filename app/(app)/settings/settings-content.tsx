"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  Users,
  Tag,
  FileText,
  Plus,
  Trash2,
  Edit,
  Palette,
  Copy,
  Mail,
  MessageCircle,
  File,
  KeyRound,
  Shield,
  Power,
  UserPlus
} from "lucide-react";
import { createTag, deleteTag, createTemplate, deleteTemplate, createEmployee, resetEmployeePassword, updateEmployeeRole, toggleEmployeeActive } from "@/lib/actions";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Employee } from "@/lib/db/schema";
import type { ClientTag } from "@/lib/db/schema";
import type { OutreachTemplate } from "@/lib/db/schema";

interface SettingsContentProps {
  employees: Employee[];
  tags: ClientTag[];
  templates: OutreachTemplate[];
  currentUserRole: string;
}

export function SettingsContent({ employees, tags: initialTags, templates: initialTemplates, currentUserRole }: SettingsContentProps) {
  const [tags, setTags] = useState(initialTags);
  const [templates, setTemplates] = useState(initialTemplates);

  // Tag management
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [newTag, setNewTag] = useState({ name: "", color: "blue" });

  // Template management
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    body: "",
    subject: "",
    channel: "general" as "text" | "email" | "general",
  });

  // Employee management
  const isManager = currentUserRole === "manager";
  const [showAddEmployeeDialog, setShowAddEmployeeDialog] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: "", username: "", password: "", role: "associate" as "associate" | "manager" });
  const [resetPasswordEmployee, setResetPasswordEmployee] = useState<Employee | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const tagColors = [
    { name: "blue", class: "bg-blue-500" },
    { name: "green", class: "bg-green-500" },
    { name: "red", class: "bg-red-500" },
    { name: "yellow", class: "bg-yellow-500" },
    { name: "purple", class: "bg-purple-500" },
    { name: "orange", class: "bg-orange-500" },
    { name: "pink", class: "bg-pink-500" },
    { name: "gray", class: "bg-gray-500" },
  ];

  const handleCreateTag = async () => {
    if (!newTag.name.trim()) {
      toast.error("Tag name is required");
      return;
    }
    try {
      await createTag(newTag.name, newTag.color);
      toast.success("Tag created");
      setShowTagDialog(false);
      setNewTag({ name: "", color: "blue" });
      window.location.reload();
    } catch {
      toast.error("Failed to create tag");
    }
  };

  const handleDeleteTag = async (id: string) => {
    try {
      await deleteTag(id);
      setTags(tags.filter((t) => t.id !== id));
      toast.success("Tag deleted");
    } catch {
      toast.error("Failed to delete tag");
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    try {
      await createTemplate(
        newTemplate.name,
        newTemplate.body,
        newTemplate.subject || null,
        newTemplate.channel
      );
      toast.success("Template created");
      setShowTemplateDialog(false);
      setNewTemplate({ name: "", body: "", subject: "", channel: "general" });
      window.location.reload();
    } catch {
      toast.error("Failed to create template");
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplate(id);
      setTemplates(templates.filter((t) => t.id !== id));
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    }
  };

  const handleCreateEmployee = async () => {
    if (!newEmployee.name.trim() || !newEmployee.username.trim() || !newEmployee.password.trim()) {
      toast.error("All fields are required");
      return;
    }
    try {
      const result = await createEmployee(newEmployee);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Employee created");
      setShowAddEmployeeDialog(false);
      setNewEmployee({ name: "", username: "", password: "", role: "associate" });
      window.location.reload();
    } catch {
      toast.error("Failed to create employee");
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordEmployee || !newPassword.trim()) {
      toast.error("New password is required");
      return;
    }
    try {
      const result = await resetEmployeePassword(resetPasswordEmployee.id, newPassword);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Password reset for ${resetPasswordEmployee.name}`);
      setResetPasswordEmployee(null);
      setNewPassword("");
    } catch {
      toast.error("Failed to reset password");
    }
  };

  const handleToggleRole = async (employee: Employee) => {
    const newRole = employee.role === "manager" ? "associate" : "manager";
    if (employee.role === "manager") {
      if (!confirm(`Demote ${employee.name} from manager to associate?`)) return;
    }
    try {
      const result = await updateEmployeeRole(employee.id, newRole);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${employee.name} is now ${newRole}`);
      window.location.reload();
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleToggleActive = async (employee: Employee) => {
    try {
      const result = await toggleEmployeeActive(employee.id, !employee.active);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${employee.name} ${employee.active ? "deactivated" : "activated"}`);
      window.location.reload();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "text": return <MessageCircle className="h-4 w-4" />;
      case "email": return <Mail className="h-4 w-4" />;
      default: return <File className="h-4 w-4" />;
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage employees, tags, and outreach templates
        </p>
      </div>

      <Tabs defaultValue="employees" className="space-y-6">
        <TabsList>
          <TabsTrigger value="employees" className="gap-1">
            <Users className="h-4 w-4" />
            Employees
          </TabsTrigger>
          <TabsTrigger value="tags" className="gap-1">
            <Tag className="h-4 w-4" />
            Tags
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
        </TabsList>

        {/* Employees Tab */}
        <TabsContent value="employees">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>
                    {employees.length} employee{employees.length !== 1 ? "s" : ""} registered
                  </CardDescription>
                </div>
                {isManager && (
                  <Dialog open={showAddEmployeeDialog} onOpenChange={setShowAddEmployeeDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Employee
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Employee</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="empName">Name</Label>
                          <Input
                            id="empName"
                            placeholder="Full name"
                            value={newEmployee.name}
                            onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="empUsername">Username</Label>
                          <Input
                            id="empUsername"
                            placeholder="Login username"
                            value={newEmployee.username}
                            onChange={(e) => setNewEmployee({ ...newEmployee, username: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="empPassword">Temporary Password</Label>
                          <Input
                            id="empPassword"
                            type="password"
                            placeholder="Temporary password"
                            value={newEmployee.password}
                            onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="empRole">Role</Label>
                          <Select
                            value={newEmployee.role}
                            onValueChange={(value) => setNewEmployee({ ...newEmployee, role: value as "associate" | "manager" })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="associate">Associate</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button onClick={handleCreateEmployee} className="w-full">
                          Create Employee
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    {isManager && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell className="text-muted-foreground">{employee.username}</TableCell>
                      <TableCell>
                        <Badge variant={employee.role === "manager" ? "default" : "secondary"}>
                          {employee.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={employee.active ? "default" : "secondary"}>
                          {employee.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {isManager && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => { setResetPasswordEmployee(employee); setNewPassword(""); }}>
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Reset Password</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => handleToggleRole(employee)}>
                                  <Shield className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{employee.role === "manager" ? "Demote to associate" : "Promote to manager"}</TooltipContent>
                            </Tooltip>
                            <AlertDialog>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" disabled={employee.username === "__self__"}>
                                      <Power className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                </TooltipTrigger>
                                <TooltipContent>{employee.active ? "Deactivate" : "Activate"}</TooltipContent>
                              </Tooltip>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{employee.active ? "Deactivate" : "Activate"} Employee</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to {employee.active ? "deactivate" : "activate"} <strong>{employee.name}</strong>?
                                    {employee.active && " They will no longer be able to log in."}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleToggleActive(employee)}>
                                    {employee.active ? "Deactivate" : "Activate"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Reset Password Dialog */}
          <Dialog open={!!resetPasswordEmployee} onOpenChange={(open) => { if (!open) setResetPasswordEmployee(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Password for {resetPasswordEmployee?.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <Button onClick={handleResetPassword} className="w-full">
                  Reset Password
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Client Tags</CardTitle>
                  <CardDescription>
                    {tags.length} tags available for client categorization
                  </CardDescription>
                </div>
                <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Tag
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Tag</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="tagName">Tag Name</Label>
                        <Input
                          id="tagName"
                          placeholder="e.g., VIP"
                          value={newTag.name}
                          onChange={(e) => setNewTag({ ...newTag, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Color</Label>
                        <div className="flex flex-wrap gap-2">
                          {tagColors.map((color) => (
                            <button
                              key={color.name}
                              className={`w-8 h-8 rounded-full ${color.class} ${
                                newTag.color === color.name
                                  ? "ring-2 ring-offset-2 ring-offset-background ring-primary"
                                  : ""
                              }`}
                              onClick={() => setNewTag({ ...newTag, color: color.name })}
                            />
                          ))}
                        </div>
                      </div>
                      <Button onClick={handleCreateTag} className="w-full">
                        Create Tag
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {tags.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">No tags created</p>
                  <p className="text-sm mt-1">Create tags to categorize your clients</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tag</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tags.map((tag) => {
                      const colorObj = tagColors.find((c) => c.name === tag.color);
                      return (
                        <TableRow key={tag.id}>
                          <TableCell className="font-medium">{tag.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded-full ${colorObj?.class || "bg-gray-500"}`} />
                              <span className="text-sm text-muted-foreground">{tag.color}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{tag.usageCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Tag</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete the <strong>{tag.name}</strong> tag? This will remove it from all clients.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteTag(tag.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Outreach Templates</CardTitle>
                  <CardDescription>
                    {templates.length} template{templates.length !== 1 ? "s" : ""} for outreach messages
                  </CardDescription>
                </div>
                <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Template
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Create Template</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="templateName">Template Name</Label>
                        <Input
                          id="templateName"
                          placeholder="e.g., Birthday Follow-up"
                          value={newTemplate.name}
                          onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="templateChannel">Channel</Label>
                        <Select
                          value={newTemplate.channel}
                          onValueChange={(value) => setNewTemplate({ ...newTemplate, channel: value as any })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="general">General</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {newTemplate.channel === "email" && (
                        <div className="space-y-2">
                          <Label htmlFor="templateSubject">Subject</Label>
                          <Input
                            id="templateSubject"
                            placeholder="Email subject line..."
                            value={newTemplate.subject}
                            onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="templateBody">Body</Label>
                        <Textarea
                          id="templateBody"
                          placeholder="Template body... Use {{first_name}}, {{last_name}}, {{employee_name}} for personalization"
                          value={newTemplate.body}
                          onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                          rows={6}
                        />
                      </div>
                      <Button onClick={handleCreateTemplate} className="w-full">
                        Create Template
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {templates.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">No templates created</p>
                  <p className="text-sm mt-1">Create templates for faster outreach</p>
                </div>
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
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive shrink-0">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Template</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete the <strong>{template.name}</strong> template? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteTemplate(template.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}