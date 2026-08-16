"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DatabaseBackup, Clock } from "lucide-react";
import { shouldShowBackupReminder, downloadBackup, setLastBackupDate } from "@/lib/backup-client";
import { useSession } from "next-auth/react";

export function BackupReminderDialog() {
  const { data: session } = useSession();
  const isManager = session?.user?.role === "manager";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isManager && shouldShowBackupReminder()) setOpen(true);
  }, [isManager]);

  function snooze() {
    // Snooze by setting the last backup date to today — next Monday it'll check again
    setLastBackupDate();
    setOpen(false);
  }

  async function handleBackup() {
    setLoading(true);
    try {
      await downloadBackup();
      setOpen(false);
    } catch {
      // If user cancels the file picker, just close gracefully
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DatabaseBackup className="size-5 text-amber-500" />
            <DialogTitle>Weekly Backup Reminder</DialogTitle>
          </div>
          <DialogDescription>
            It&apos;s been over a week since the last database backup. Back up now to protect your client data.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={snooze} className="gap-2">
            <Clock className="size-4" />
            Remind Me Next Monday
          </Button>
          <Button onClick={handleBackup} disabled={loading} className="gap-2">
            <DatabaseBackup className="size-4" />
            {loading ? "Preparing…" : "Back Up Now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
