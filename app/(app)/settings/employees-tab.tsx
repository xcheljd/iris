"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldSet, FieldLegend, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { PasswordInput } from "@/components/password-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
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
  Pencil,
  ChevronUp,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { createEmployee, resetEmployeePassword, updateEmployeeRole, toggleEmployeeActive, updateEmployee, deactivateEmployee, reorderEmployee, deleteEmployee } from "@/lib/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { fullName } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface EmployeesTabProps {
  employees: {
    id: string;
    firstName: string;
    lastName: string | null;
    username: string;
    role: string;
    active: boolean;
    sortOrder: number;
    activeClientCount: number;
  }[];
}

export function EmployeesTab({ employees }: EmployeesTabProps) {
  const router = useRouter();
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ firstName: "", lastName: "", username: "", password: "", role: "associate" as "associate" | "manager" });
  const [resetPasswordEmployee, setResetPasswordEmployee] = useState<(typeof employees)[number] | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deactivateTarget, setDeactivateTarget] = useState<(typeof employees)[number] | null>(null);
  const [deactivateMode, setDeactivateMode] = useState<"keep" | "reassign" | "unassign">("keep");
  const [reassignToId, setReassignToId] = useState<string>("");
  const [deactivating, setDeactivating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<(typeof employees)[number] | null>(null);
  const [editEmployeeTarget, setEditEmployeeTarget] = useState<(typeof employees)[number] | null>(null);
  const [editEmployee, setEditEmployee] = useState({ firstName: "", lastName: "", username: "", role: "associate" as "associate" | "manager" });

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (!showInactive) list = list.filter((e) => e.active);
    if (!employeeSearch) return list;
    const q = employeeSearch.toLowerCase();
    return list.filter((e) =>
      e.firstName.toLowerCase().includes(q) || (e.lastName ?? "").toLowerCase().includes(q) || e.username.toLowerCase().includes(q)
    );
  }, [employees, employeeSearch, showInactive]);

  // Reorder is only meaningful with the natural list order — disable when
  // a search is active so the up/down buttons don't operate on a filtered
  // view that doesn't reflect persistent neighbor positions.
  const canReorder = !employeeSearch;

  /** Active employees other than this one — candidates for reassign. */
  const reassignCandidates = useMemo(
    () => employees.filter((e) => e.active && e.id !== deactivateTarget?.id),
    [employees, deactivateTarget?.id],
  );

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

  // Activation is a simple flip — only deactivate uses the richer dialog.
  const handleActivate = async (employee: (typeof employees)[number]) => {
    try {
      const result = await toggleEmployeeActive(employee.id, true);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${fullName(employee)} activated`);
      router.refresh();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget) return;
    if (deactivateMode === "reassign" && !reassignToId) {
      toast.error("Pick an employee to reassign clients to");
      return;
    }
    setDeactivating(true);
    try {
      const result = await deactivateEmployee(deactivateTarget.id, {
        clientHandling: deactivateMode,
        reassignToId: deactivateMode === "reassign" ? reassignToId : undefined,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const n = deactivateTarget.activeClientCount;
      const suffix =
        deactivateMode === "keep" || n === 0 ? ""
        : deactivateMode === "reassign" ? ` and reassigned ${n} client${n === 1 ? "" : "s"}`
        : ` and unassigned ${n} client${n === 1 ? "" : "s"}`;
      toast.success(`${fullName(deactivateTarget)} deactivated${suffix}`);
      setDeactivateTarget(null);
      setDeactivateMode("keep");
      setReassignToId("");
      router.refresh();
    } catch {
      toast.error("Failed to deactivate employee");
    } finally {
      setDeactivating(false);
    }
  };

  const handleReorder = async (employeeId: string, direction: "up" | "down") => {
    try {
      const result = await reorderEmployee(employeeId, direction);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    } catch {
      toast.error("Failed to reorder");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await deleteEmployee(deleteTarget.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`${fullName(deleteTarget)} deleted`);
      setDeleteTarget(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete employee");
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
                  <UserPlus className="size-4 mr-2" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Employee</DialogTitle>
                  <DialogDescription>Create a new team member account.</DialogDescription>
                </DialogHeader>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="empFirstName">First Name</FieldLabel>
                    <Input id="empFirstName" placeholder="First name" value={newEmployee.firstName} onChange={(e) => setNewEmployee({ ...newEmployee, firstName: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="empLastName">Last Name</FieldLabel>
                    <Input id="empLastName" placeholder="Last name" value={newEmployee.lastName} onChange={(e) => setNewEmployee({ ...newEmployee, lastName: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="empUsername">Username</FieldLabel>
                    <Input id="empUsername" placeholder="Login username" value={newEmployee.username} onChange={(e) => setNewEmployee({ ...newEmployee, username: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="empPassword">Temporary Password</FieldLabel>
                    <PasswordInput id="empPassword" placeholder="Temporary password" value={newEmployee.password} onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="empRole">Role</FieldLabel>
                    <Select value={newEmployee.role} onValueChange={(value) => setNewEmployee({ ...newEmployee, role: value as "associate" | "manager" })}>
                      <SelectTrigger id="empRole"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="associate">Associate</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
                <DialogFooter className="mt-4">
                  <Button onClick={handleCreateEmployee} className="w-full">Create Employee</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <SearchInput
              placeholder="Search employees..."
              value={employeeSearch}
              onChangeAction={setEmployeeSearch}
              className="max-w-sm flex-1"
            />
            <label className="flex items-center gap-2 text-sm whitespace-nowrap">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              Show inactive
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {canReorder && <TableHead className="w-10"><span className="sr-only">Reorder</span></TableHead>}
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map((employee, idx) => (
                <TableRow key={employee.id}>
                  {canReorder && (
                    <TableCell className="w-10 px-1">
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-5 p-0"
                          aria-label={`Move ${fullName(employee)} up`}
                          disabled={idx === 0}
                          onClick={() => handleReorder(employee.id, "up")}
                        >
                          <ChevronUp className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-5 p-0"
                          aria-label={`Move ${fullName(employee)} down`}
                          disabled={idx === filteredEmployees.length - 1}
                          onClick={() => handleReorder(employee.id, "down")}
                        >
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    {fullName(employee)}
                    {!employee.active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                  </TableCell>
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
                            handleActivate(employee);
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
                        <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Employee actions">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          setEditEmployeeTarget(employee);
                          setEditEmployee({ firstName: employee.firstName, lastName: employee.lastName ?? "", username: employee.username, role: employee.role as "associate" | "manager" });
                        }}>
                          <Pencil className="size-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setResetPasswordEmployee(employee); setNewPassword(""); }}>
                          <KeyRound className="size-4 mr-2" />
                          Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleRole(employee)}>
                          <Shield className="size-4 mr-2" />
                          {employee.role === "manager" ? "Demote to Associate" : "Promote to Manager"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className={employee.active ? "text-destructive" : undefined}
                          disabled={employee.username === "__self__"}
                          onClick={() => {
                            if (employee.active) {
                              setDeactivateTarget(employee);
                            } else {
                              handleActivate(employee);
                            }
                          }}
                        >
                          {employee.active ? "Deactivate" : "Reactivate"}
                        </DropdownMenuItem>
                        {!employee.active && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(employee)}
                          >
                            <Trash2 className="size-4 mr-2" />
                            Delete employee
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredEmployees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canReorder ? 6 : 5} className="p-0">
                    <EmptyState description="No employees match your search" compact />
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
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="newPassword">New Password</FieldLabel>
              <PasswordInput id="newPassword" placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button onClick={handleResetPassword} className="w-full">Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate dialog — asks how to handle the employee's assigned clients */}
      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateTarget(null);
            setDeactivateMode("keep");
            setReassignToId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {deactivateTarget ? fullName(deactivateTarget) : "Employee"}</DialogTitle>
            <DialogDescription>
              {deactivateTarget ? fullName(deactivateTarget) : "They"} will no longer be able to log in.
              {deactivateTarget && deactivateTarget.activeClientCount > 0 && (
                <> They currently own <strong>{deactivateTarget.activeClientCount}</strong>{" "}
                client{deactivateTarget.activeClientCount === 1 ? "" : "s"}.</>
              )}
            </DialogDescription>
          </DialogHeader>
          {deactivateTarget && deactivateTarget.activeClientCount > 0 ? (
            <FieldSet className="gap-3 py-2">
              <FieldLegend variant="label">What about their clients?</FieldLegend>
              <RadioGroup value={deactivateMode} onValueChange={(v) => setDeactivateMode(v as "keep" | "reassign" | "unassign")}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="keep" id="deactivate-keep" className="mt-1" />
                  <div className="flex-1">
                    <FieldLabel htmlFor="deactivate-keep" className="font-normal cursor-pointer">Keep with this employee</FieldLabel>
                    <FieldDescription className="text-xs">Clients stay assigned. Useful if they may return.</FieldDescription>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="reassign" id="deactivate-reassign" className="mt-1" />
                  <div className="flex flex-col flex-1 gap-2">
                    <FieldLabel htmlFor="deactivate-reassign" className="font-normal cursor-pointer">Reassign to another employee</FieldLabel>
                    {deactivateMode === "reassign" && (
                      <Select value={reassignToId} onValueChange={setReassignToId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Pick an employee…" /></SelectTrigger>
                        <SelectContent>
                          {reassignCandidates.length === 0 ? (
                            <SelectItem value="__none__" disabled>No active employees available</SelectItem>
                          ) : (
                            reassignCandidates.map((e) => (
                              <SelectItem key={e.id} value={e.id}>{fullName(e)}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="unassign" id="deactivate-unassign" className="mt-1" />
                  <div className="flex-1">
                    <FieldLabel htmlFor="deactivate-unassign" className="font-normal cursor-pointer">Unassign for later</FieldLabel>
                    <FieldDescription className="text-xs">Clients become unowned — reassign manually from the Clients page.</FieldDescription>
                  </div>
                </div>
              </RadioGroup>
            </FieldSet>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeactivateTarget(null);
                setDeactivateMode("keep");
                setReassignToId("");
              }}
              disabled={deactivating}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeactivate}
              disabled={deactivating || (deactivateMode === "reassign" && !reassignToId)}
            >
              {deactivating ? "Deactivating…" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete (soft) — only enabled from the dropdown when inactive */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChangeAction={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget ? fullName(deleteTarget) : "employee"}?`}
        description={
          <>
            <strong>{deleteTarget ? fullName(deleteTarget) : ""}</strong> will be removed from the
            Employees list. Their historical records (activity events, outreach logs, approvals)
            stay intact for the audit trail. This can&apos;t be undone from the UI.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirmAction={handleDelete}
      />

      {/* Edit Employee Dialog */}
      <Dialog open={!!editEmployeeTarget} onOpenChange={(open) => { if (!open) setEditEmployeeTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
            <DialogDescription>Update {editEmployeeTarget ? fullName(editEmployeeTarget) : ""}&apos;s information.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="editEmpFirstName">First Name</FieldLabel>
              <Input id="editEmpFirstName" value={editEmployee.firstName} onChange={(e) => setEditEmployee({ ...editEmployee, firstName: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="editEmpLastName">Last Name</FieldLabel>
              <Input id="editEmpLastName" value={editEmployee.lastName} onChange={(e) => setEditEmployee({ ...editEmployee, lastName: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="editEmpUsername">Username</FieldLabel>
              <Input id="editEmpUsername" value={editEmployee.username} onChange={(e) => setEditEmployee({ ...editEmployee, username: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="editEmpRole">Role</FieldLabel>
              <Select value={editEmployee.role} onValueChange={(value) => setEditEmployee({ ...editEmployee, role: value as "associate" | "manager" })}>
                <SelectTrigger id="editEmpRole"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="associate">Associate</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button onClick={handleEditEmployee} className="w-full">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
