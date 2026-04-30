"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { PaginationFooter } from "@/components/pagination-footer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users,
  Tag,
  FileText,
  Plus,
  Trash2,
  Mail,
  MessageCircle,
  File,
  KeyRound,
  Shield,
  UserPlus,
  MoreHorizontal,
  RotateCcw,
  Eye,
  EyeOff,
} from "lucide-react";
import { createTag, deleteTag, createTemplate, deleteTemplate, createEmployee, resetEmployeePassword, updateEmployeeRole, toggleEmployeeActive, restoreClient, purgeClient } from "@/lib/actions";
import { toast } from "sonner";
import { format } from "date-fns";
import { Topbar } from "@/components/topbar";
import type { Employee } from "@/lib/db/schema";
import type { ClientTag } from "@/lib/db/schema";
import type { OutreachTemplate } from "@/lib/db/schema";
import type { Client } from "@/lib/db/schema";

interface SettingsContentProps {
  employees: Employee[];
  tags: ClientTag[];
  templates: OutreachTemplate[];
  deletedClients: Client[];
  currentUserRole: string;
}

const PAGE_SIZE = 20;

export function SettingsContent({ employees, tags: initialTags, templates: initialTemplates, deletedClients, currentUserRole }: SettingsContentProps) {
  const [tags, setTags] = useState(initialTags);
  const [templates, setTemplates] = useState(initialTemplates);
  const [employeeSearch, setEmployeeSearch] = useState("");

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
  const [showEmpPw, setShowEmpPw] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null);
  const [deleteTagTarget, setDeleteTagTarget] = useState<ClientTag | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<OutreachTemplate | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Client | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Client | null>(null);
  const [deletedPage, setDeletedPage] = useState(1);

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

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch) return employees;
    const q = employeeSearch.toLowerCase();
    return employees.filter((e) =>
      e.name.toLowerCase().includes(q) || e.username.toLowerCase().includes(q)
    );
  }, [employees, employeeSearch]);

  const deletedTotalPages = Math.ceil(deletedClients.length / PAGE_SIZE);
  const pagedDeleted = deletedClients.slice((deletedPage - 1) * PAGE_SIZE, deletedPage * PAGE_SIZE);

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
      setDeleteTagTarget(null);
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
      await createTemplate(newTemplate.name, newTemplate.body, newTemplate.subject || null, newTemplate.channel);
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
      setDeleteTemplateTarget(null);
    } catch {
      toast.error("Failed to delete template");
    }
  };

  const handleCreateEmployee = async () => {
    if (!newEmployee.name.trim() || !newEmployee.username.trim() || !newEmployee.password.trim()) {
      toast.error("Name, username, and password are required");
      return;
    }
    if (newEmployee.password.length < 6) {
      toast.error("Password must be at least 6 characters");
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
      setDeactivateTarget(null);
      window.location.reload();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreClient(restoreTarget.id);
      toast.success("Client restored");
      setRestoreTarget(null);
      window.location.reload();
    } catch {
      toast.error("Failed to restore client");
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    try {
      await purgeClient(purgeTarget.id);
      toast.success("Client permanently deleted");
      setPurgeTarget(null);
      window.location.reload();
    } catch {
      toast.error("Failed to purge client");
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
    <>
      <Topbar title="Settings" />
      <div className="flex-1 p-4 md:p-6">
      <div className="mb-6">
        <h1 className="sr-only">Settings</h1>
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
          {isManager && (
            <TabsTrigger value="deleted" className="gap-1">
              <Trash2 className="h-4 w-4" />
              Deleted
            </TabsTrigger>
          )}
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
                        <DialogDescription>Create a new team member account.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="empName">Name</Label>
                          <Input id="empName" placeholder="Full name" value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="empUsername">Username</Label>
                          <Input id="empUsername" placeholder="Login username" value={newEmployee.username} onChange={(e) => setNewEmployee({ ...newEmployee, username: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="empPassword">Temporary Password</Label>
                          <div className="relative flex items-center">
                            <Input id="empPassword" type={showEmpPw ? "text" : "password"} placeholder="Temporary password" value={newEmployee.password} onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })} className="pr-9" />
                            <button type="button" className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground" onClick={() => setShowEmpPw(!showEmpPw)} aria-label={showEmpPw ? "Hide password" : "Show password"}>
                              {showEmpPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="empRole">Role</Label>
                          <Select value={newEmployee.role} onValueChange={(value) => setNewEmployee({ ...newEmployee, role: value as "associate" | "manager" })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="associate">Associate</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleCreateEmployee} className="w-full">Create Employee</Button>
                        </DialogFooter>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              {/* Search */}
              <div className="mt-3">
                <SearchInput
                  placeholder="Search employees..."
                  value={employeeSearch}
                  onChange={setEmployeeSearch}
                  className="max-w-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    {isManager && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">{employee.username}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {employee.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isManager ? (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={employee.active}
                              onCheckedChange={() => {
                                if (employee.active) {
                                  setDeactivateTarget(employee);
                                } else {
                                  handleToggleActive(employee);
                                }
                              }}
                              disabled={employee.username === "__self__"}
                            />
                            <Badge variant={employee.active ? "default" : "outline"}>
                              {employee.active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        ) : (
                          <Badge variant={employee.active ? "default" : "outline"}>
                            {employee.active ? "Active" : "Inactive"}
                          </Badge>
                        )}
                      </TableCell>
                      {isManager && (
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Employee actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setResetPasswordEmployee(employee); setNewPassword(""); }}>
                                <KeyRound className="h-4 w-4 mr-2" />
                                Reset Password
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleRole(employee)}>
                                <Shield className="h-4 w-4 mr-2" />
                                {employee.role === "manager" ? "Demote to Associate" : "Promote to Manager"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                disabled={employee.username === "__self__"}
                                onClick={() => {
                                  if (employee.active) {
                                    setDeactivateTarget(employee);
                                  } else {
                                    handleToggleActive(employee);
                                  }
                                }}
                              >
                                {employee.active ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isManager ? 5 : 4} className="text-center py-8 text-muted-foreground">
                        No employees match your search
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          <Separator className="my-6" />

          {/* Reset Password Dialog */}
          <Dialog open={!!resetPasswordEmployee} onOpenChange={(open) => { if (!open) setResetPasswordEmployee(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Password for {resetPasswordEmployee?.name}</DialogTitle>
                <DialogDescription>Set a new temporary password for this account.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative flex items-center">
                    <Input id="newPassword" type={showResetPw ? "text" : "password"} placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="pr-9" />
                    <button type="button" className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground" onClick={() => setShowResetPw(!showResetPw)} aria-label={showResetPw ? "Hide password" : "Show password"}>
                      {showResetPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleResetPassword} className="w-full">Reset Password</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>

          {/* Deactivate Confirmation */}
          <ConfirmDialog
            open={!!deactivateTarget}
            onOpenChange={(open) => !open && setDeactivateTarget(null)}
            title={<>{deactivateTarget?.active ? "Deactivate" : "Activate"} Employee</>}
            description={
              <>
                Are you sure you want to {deactivateTarget?.active ? "deactivate" : "activate"}{" "}
                <strong>{deactivateTarget?.name}</strong>?
                {deactivateTarget?.active && " They will no longer be able to log in."}
              </>
            }
            confirmLabel={deactivateTarget?.active ? "Deactivate" : "Activate"}
            onConfirm={() => deactivateTarget && handleToggleActive(deactivateTarget)}
          />
        </TabsContent>

        <Separator />

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
                      <DialogDescription>Add a new tag to categorize clients.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="tagName">Tag Name</Label>
                        <Input id="tagName" placeholder="e.g., VIP" value={newTag.name} onChange={(e) => setNewTag({ ...newTag, name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Color</Label>
                        <div className="flex flex-wrap gap-2">
                          {tagColors.map((color) => (
                            <button
                              key={color.name}
                              className={`w-8 h-8 rounded-full ${color.class} ${
                                newTag.color === color.name ? "ring-2 ring-offset-2 ring-offset-background ring-primary" : ""
                              }`}
                              onClick={() => setNewTag({ ...newTag, color: color.name })}
                            />
                          ))}
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleCreateTag} className="w-full">Create Tag</Button>
                      </DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {tags.length === 0 ? (
                <EmptyState
                  icon={Tag}
                  title="No tags created"
                  description="Create tags to categorize your clients"
                />
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tag</TableHead>
                      <TableHead className="hidden sm:table-cell">Color</TableHead>
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
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded-full ${colorObj?.class || "bg-gray-500"}`} />
                              <span className="text-sm text-muted-foreground">{tag.color}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{tag.usageCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Tag actions">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTagTarget(tag)}>
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <Separator />

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
                      <DialogDescription>Write a reusable outreach message template.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="templateName">Template Name</Label>
                        <Input id="templateName" placeholder="e.g., Birthday Follow-up" value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="templateChannel">Channel</Label>
                        <Select value={newTemplate.channel} onValueChange={(value) => setNewTemplate({ ...newTemplate, channel: value as "text" | "email" | "general" })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                          <Input id="templateSubject" placeholder="Email subject line..." value={newTemplate.subject} onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })} />
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
                      <DialogFooter>
                        <Button onClick={handleCreateTemplate} className="w-full">Create Template</Button>
                      </DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" aria-label="Template actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTemplateTarget(template)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isManager && (
          <TabsContent value="deleted">
            <Card>
              <CardHeader>
                <CardTitle>Deleted Clients</CardTitle>
                <CardDescription>
                  {deletedClients.length} deleted client{deletedClients.length !== 1 ? "s" : ""}. Restore or permanently remove them.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {deletedClients.length === 0 ? (
                  <EmptyState
                    icon={Trash2}
                    title="No deleted clients"
                    description="Deleted clients will appear here for recovery"
                  />
                ) : (
                  <>
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden sm:table-cell">Previous Status</TableHead>
                        <TableHead className="hidden sm:table-cell">Deleted Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedDeleted.map((dc) => (
                        <TableRow key={dc.id}>
                          <TableCell className="font-medium">{dc.firstName} {dc.lastName ?? ""}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className="capitalize">{dc.previousStatus ?? "active"}</Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                            {dc.deletedAt ? format(new Date(dc.deletedAt), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="outline" size="sm" onClick={() => setRestoreTarget(dc)}>
                                <RotateCcw className="h-4 w-4 mr-1" />
                                Restore
                              </Button>
                              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setPurgeTarget(dc)}>
                                <Trash2 className="h-4 w-4 mr-1" />
                                Purge
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                  <PaginationFooter
                    currentPage={deletedPage}
                    totalPages={deletedTotalPages}
                    onPageChange={setDeletedPage}
                    totalItems={deletedClients.length}
                    pageSize={PAGE_SIZE}
                    itemLabel="clients"
                  />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Delete Tag Confirmation */}
      <ConfirmDialog
        open={!!deleteTagTarget}
        onOpenChange={(open) => !open && setDeleteTagTarget(null)}
        title="Delete Tag"
        description={<>Are you sure you want to delete the <strong>{deleteTagTarget?.name}</strong> tag? This will remove it from all clients.</>}
        confirmLabel="Delete"
        onConfirm={() => deleteTagTarget && handleDeleteTag(deleteTagTarget.id)}
        variant="destructive"
      />

      {/* Delete Template Confirmation */}
      <ConfirmDialog
        open={!!deleteTemplateTarget}
        onOpenChange={(open) => !open && setDeleteTemplateTarget(null)}
        title="Delete Template"
        description={<>Are you sure you want to delete the <strong>{deleteTemplateTarget?.name}</strong> template? This action cannot be undone.</>}
        confirmLabel="Delete"
        onConfirm={() => deleteTemplateTarget && handleDeleteTemplate(deleteTemplateTarget.id)}
        variant="destructive"
      />

      {/* Restore Client Confirmation */}
      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="Restore Client"
        description={<>Are you sure you want to restore <strong>{restoreTarget?.firstName} {restoreTarget?.lastName}</strong>? They will reappear in the client list with their previous status.</>}
        confirmLabel="Restore"
        onConfirm={handleRestore}
      />

      {/* Purge Client Confirmation */}
      <ConfirmDialog
        open={!!purgeTarget}
        onOpenChange={(open) => !open && setPurgeTarget(null)}
        title="Permanently Delete Client"
        description={<>Are you sure you want to permanently delete <strong>{purgeTarget?.firstName} {purgeTarget?.lastName}</strong>? This permanently removes the client and all their data. This cannot be undone.</>}
        confirmLabel="Purge"
        variant="destructive"
        onConfirm={handlePurge}
      />
      </div>
    </>
  );
}
