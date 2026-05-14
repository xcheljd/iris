"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchInput } from "@/components/search-input";
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
  KeyRound,
  Shield,
  UserPlus,
  MoreHorizontal,
  Eye,
  EyeOff,
  Pencil,
} from "lucide-react";
import { createEmployee, resetEmployeePassword, updateEmployeeRole, toggleEmployeeActive, updateEmployee } from "@/lib/actions";
import { toast } from "sonner";
import { fullName } from "@/lib/utils";

interface EmployeesTabProps {
  employees: { id: string; firstName: string; lastName: string | null; username: string; role: string; active: boolean }[];
}

export function EmployeesTab({ employees }: EmployeesTabProps) {
  const router = useRouter();
  const [employeeSearch, setEmployeeSearch] = useState("");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ firstName: "", lastName: "", username: "", password: "", role: "associate" as "associate" | "manager" });
  const [resetPasswordEmployee, setResetPasswordEmployee] = useState<(typeof employees)[number] | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showEmpPw, setShowEmpPw] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<(typeof employees)[number] | null>(null);
  const [editEmployeeTarget, setEditEmployeeTarget] = useState<(typeof employees)[number] | null>(null);
  const [editEmployee, setEditEmployee] = useState({ firstName: "", lastName: "", username: "", role: "associate" as "associate" | "manager", active: true });

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch) return employees;
    const q = employeeSearch.toLowerCase();
    return employees.filter((e) =>
      e.firstName.toLowerCase().includes(q) || (e.lastName ?? "").toLowerCase().includes(q) || e.username.toLowerCase().includes(q)
    );
  }, [employees, employeeSearch]);

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
      setShowAddDialog(false);
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

  const handleToggleRole = async (employee: (typeof employees)[number]) => {
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

  const handleToggleActive = async (employee: (typeof employees)[number]) => {
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                {employees.length} employee{employees.length !== 1 ? "s" : ""} registered
              </CardDescription>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
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
          </div>
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{fullName(employee)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{employee.username}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{employee.role}</Badge>
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
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
                          setEditEmployee({ firstName: employee.firstName, lastName: employee.lastName ?? "", username: employee.username, role: employee.role as "associate" | "manager", active: employee.active });
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
                </TableRow>
              ))}
              {filteredEmployees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No employees match your search
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

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
    </>
  );
}
