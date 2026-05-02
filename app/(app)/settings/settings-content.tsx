"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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
  UserCircle,
  Pencil,
} from "lucide-react";
import { createTag, deleteTag, createTemplate, deleteTemplate, createEmployee, resetEmployeePassword, updateEmployeeRole, toggleEmployeeActive, restoreClient, purgeClient, updateEmployee } from "@/lib/actions";
import { toast } from "sonner";
import { format } from "date-fns";
import { Topbar } from "@/components/topbar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
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
  currentUserId: string;
}

const PAGE_SIZE = 20;

const fullName = (e: { firstName: string; lastName: string | null }) =>
  [e.firstName, e.lastName].filter(Boolean).join(" ");

export function SettingsContent({ employees, tags: initialTags, templates: initialTemplates, deletedClients, currentUserRole, currentUserId }: SettingsContentProps) {
  const router = useRouter();
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
  const [newEmployee, setNewEmployee] = useState({ firstName: "", lastName: "", username: "", password: "", role: "associate" as "associate" | "manager" });
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

  // Profile management
  const currentUser = employees.find((e) => e.id === currentUserId);
  const [showEditProfileDialog, setShowEditProfileDialog] = useState(false);
  const [editProfile, setEditProfile] = useState({ firstName: "", lastName: "", username: "" });

  // Edit employee management
  const [editEmployeeTarget, setEditEmployeeTarget] = useState<Employee | null>(null);
  const [editEmployee, setEditEmployee] = useState({ firstName: "", lastName: "", username: "", role: "associate" as "associate" | "manager", active: true });

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
      e.firstName.toLowerCase().includes(q) || (e.lastName ?? "").toLowerCase().includes(q) || e.username.toLowerCase().includes(q)
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
      router.refresh();
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
      router.refresh();
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
    if (!newEmployee.firstName.trim() || !newEmployee.username.trim() || !newEmployee.password.trim()) {
      toast.error("First name, username, and password are required");
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
      setNewEmployee({ firstName: "", lastName: "", username: "", password: "", role: "associate" });
      router.refresh();
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
      toast.success(`Password reset for ${fullName(resetPasswordEmployee)}`);
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
      toast.success(`${fullName(employee)} is now ${newRole}`);
      router.refresh();
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
      toast.success(`${fullName(employee)} ${employee.active ? "deactivated" : "activated"}`);
      setDeactivateTarget(null);
      router.refresh();
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
      router.refresh();
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
      router.refresh();
    } catch {
      toast.error("Failed to purge client");
    }
  };

  const handleEditProfile = async () => {
    if (!editProfile.firstName.trim() || !editProfile.username.trim()) {
      toast.error("First name and username are required");
      return;
    }
    try {
      const result = await updateEmployee(currentUserId, { firstName: editProfile.firstName, lastName: editProfile.lastName, username: editProfile.username });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated");
      setShowEditProfileDialog(false);
      router.refresh();
    } catch {
      toast.error("Failed to update profile");
    }
  };

  const handleEditEmployee = async () => {
    if (!editEmployeeTarget) return;
    if (!editEmployee.firstName.trim() || !editEmployee.username.trim()) {
      toast.error("First name and username are required");
      return;
    }
    try {
      const result = await updateEmployee(editEmployeeTarget.id, {
        firstName: editEmployee.firstName,
        lastName: editEmployee.lastName,
        username: editEmployee.username,
        role: editEmployee.role,
        active: editEmployee.active,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${editEmployee.firstName} updated`);
      setEditEmployeeTarget(null);
      router.refresh();
    } catch {
      toast.error("Failed to update employee");
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

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1">
            <UserCircle className="h-4 w-4" />
            Profile
          </TabsTrigger>
          {isManager && (
            <TabsTrigger value="employees" className="gap-1">
              <Users className="h-4 w-4" />
              Employees
            </TabsTrigger>
          )}
          <TabsTrigger value="tags" className="gap-1">
            <Tag className="h-4 w-4" />
            Tags
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="deleted" className="gap-1">
            <Trash2 className="h-4 w-4" />
            Deleted
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Your Profile</CardTitle>
              <CardDescription>View and manage your account information</CardDescription>
            </CardHeader>
            <CardContent>
              {currentUser ? (
                <div className="flex items-start gap-6">
                  <Avatar className="h-16 w-16 text-lg">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                       {initials(currentUser.firstName, currentUser.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <h3 className="text-lg font-semibold">{currentUser.firstName} {currentUser.lastName}</h3>
                    <p className="text-sm text-muted-foreground">@{currentUser.username}</p>
                    <Badge variant="secondary" className="capitalize">{currentUser.role}</Badge>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                       setEditProfile({ firstName: currentUser.firstName, lastName: currentUser.lastName ?? "", username: currentUser.username });
                      setShowEditProfileDialog(true);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Profile
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">Could not load profile information.</p>
              )}
            </CardContent>
          </Card>

          <Dialog open={showEditProfileDialog} onOpenChange={setShowEditProfileDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Profile</DialogTitle>
                <DialogDescription>Update your name and username.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profileFirstName">First Name</Label>
                  <Input id="profileFirstName" value={editProfile.firstName} onChange={(e) => setEditProfile({ ...editProfile, firstName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profileLastName">Last Name</Label>
                  <Input id="profileLastName" value={editProfile.lastName} onChange={(e) => setEditProfile({ ...editProfile, lastName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profileUsername">Username</Label>
                  <Input id="profileUsername" value={editProfile.username} onChange={(e) => setEditProfile({ ...editProfile, username: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button onClick={handleEditProfile} className="w-full">Save Changes</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Employees Tab */}
        {isManager && (
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
                          <Label htmlFor="empFirstName">First Name</Label>
                          <Input id="empFirstName" placeholder="First name" value={newEmployee.firstName} onChange={(e) => setNewEmployee({ ...newEmployee, firstName: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="empLastName">Last Name</Label>
                          <Input id="empLastName" placeholder="Last name" value={newEmployee.lastName} onChange={(e) => setNewEmployee({ ...newEmployee, lastName: e.target.value })} />
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
                       <TableCell className="font-medium">{fullName(employee)}</TableCell>
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
                              <DropdownMenuItem onClick={() => {
                                setEditEmployeeTarget(employee);
                                setEditEmployee({ firstName: employee.firstName, lastName: employee.lastName ?? "", username: employee.username, role: employee.role, active: employee.active });
                              }}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
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
                <DialogTitle>Reset Password for {resetPasswordEmployee ? fullName(resetPasswordEmployee) : ""}</DialogTitle>
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
                <strong>{deactivateTarget ? fullName(deactivateTarget) : ""}</strong>?
                {deactivateTarget?.active && " They will no longer be able to log in."}
              </>
            }
            confirmLabel={deactivateTarget?.active ? "Deactivate" : "Activate"}
            onConfirm={() => deactivateTarget && handleToggleActive(deactivateTarget)}
          />

          {/* Edit Employee Dialog */}
          <Dialog open={!!editEmployeeTarget} onOpenChange={(open) => { if (!open) setEditEmployeeTarget(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Employee</DialogTitle>
                <DialogDescription>Update {editEmployeeTarget ? fullName(editEmployeeTarget) : ""}&apos;s information.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="editEmpFirstName">First Name</Label>
                  <Input id="editEmpFirstName" value={editEmployee.firstName} onChange={(e) => setEditEmployee({ ...editEmployee, firstName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editEmpLastName">Last Name</Label>
                  <Input id="editEmpLastName" value={editEmployee.lastName} onChange={(e) => setEditEmployee({ ...editEmployee, lastName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editEmpUsername">Username</Label>
                  <Input id="editEmpUsername" value={editEmployee.username} onChange={(e) => setEditEmployee({ ...editEmployee, username: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editEmpRole">Role</Label>
                  <Select value={editEmployee.role} onValueChange={(value) => setEditEmployee({ ...editEmployee, role: value as "associate" | "manager" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="associate">Associate</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="editEmpActive">Active</Label>
                  <Switch id="editEmpActive" checked={editEmployee.active} onCheckedChange={(checked) => setEditEmployee({ ...editEmployee, active: checked })} />
                </div>
                <DialogFooter>
                  <Button onClick={handleEditEmployee} className="w-full">Save Changes</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
        )}

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
                {isManager && (
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
                )}
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
                          {isManager && (
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
                          )}
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
                {isManager && (
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
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTemplateTarget(template)}>
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
        </TabsContent>

          <TabsContent value="deleted">
            <Card>
              <CardHeader>
                <CardTitle>Deleted Clients</CardTitle>
                <CardDescription>
                  {deletedClients.length} deleted client{deletedClients.length !== 1 ? "s" : ""}{isManager ? ". Restore or permanently remove them." : "."}
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
                      {isManager && <TableHead className="text-right">Actions</TableHead>}
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
                          {isManager && (
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
                          )}
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
      </Tabs>

      {/* Delete Tag Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={!!deleteTagTarget}
        onOpenChange={(open) => !open && setDeleteTagTarget(null)}
        title="Delete Tag"
        description={<>Are you sure you want to delete the <strong>{deleteTagTarget?.name}</strong> tag? This will remove it from all clients.</>}
        confirmLabel="Delete"
        onConfirm={() => deleteTagTarget && handleDeleteTag(deleteTagTarget.id)}
        variant="destructive"
      />
      )}

      {/* Delete Template Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={!!deleteTemplateTarget}
        onOpenChange={(open) => !open && setDeleteTemplateTarget(null)}
        title="Delete Template"
        description={<>Are you sure you want to delete the <strong>{deleteTemplateTarget?.name}</strong> template? This action cannot be undone.</>}
        confirmLabel="Delete"
        onConfirm={() => deleteTemplateTarget && handleDeleteTemplate(deleteTemplateTarget.id)}
        variant="destructive"
      />
      )}

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
