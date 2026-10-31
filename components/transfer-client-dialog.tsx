"use client";

import { useState, useTransition } from "react";
import { useFetchOnOpen } from "@/hooks/use-fetch-on-open";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft } from "lucide-react";
import { transferClient } from "@/lib/actions";
import { toast } from "sonner";

interface Employee {
  id: string;
  firstName: string;
  lastName?: string | null;
  active: boolean;
}

export function TransferClientDialog({
  clientId,
  clientName,
  currentEmployeeId,
  children,
}: {
  clientId: string;
  clientName: string;
  currentEmployeeId?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [newEmployeeId, setNewEmployeeId] = useState("");
  const [pending, start] = useTransition();

  // A reply that lands after the dialog closed is ignored (useFetchOnOpen).
  const { data: employees } = useFetchOnOpen<Employee[]>(
    open,
    "employees",
    async () => {
      const r = await fetch("/api/employees");
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    () => toast.error("Failed to load employee list"),
  );
  const employeeList = (employees ?? []).filter((e) => e.active);

  const handleTransfer = () => {
    if (!newEmployeeId || newEmployeeId === currentEmployeeId) return;
    start(async () => {
      const result = await transferClient(clientId, newEmployeeId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`${clientName} transferred`);
        setOpen(false);
        setNewEmployeeId("");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-5" />
            Transfer Client
          </DialogTitle>
          <DialogDescription>
            Reassign <strong>{clientName}</strong> to a different associate.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Field>
            <FieldLabel htmlFor="tc-newEmployee">New Associate</FieldLabel>
            <Select value={newEmployeeId} onValueChange={setNewEmployeeId}>
              <SelectTrigger id="tc-newEmployee">
                <SelectValue placeholder="Select an associate…" />
              </SelectTrigger>
              <SelectContent>
                {employeeList.map((e) => (
                  <SelectItem
                    key={e.id}
                    value={e.id}
                    disabled={e.id === currentEmployeeId}
                  >
                    {e.firstName} {e.lastName ?? ""}
                    {e.id === currentEmployeeId ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!newEmployeeId || newEmployeeId === currentEmployeeId || pending}
            onClick={handleTransfer}
          >
            {pending ? "Transferring…" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
