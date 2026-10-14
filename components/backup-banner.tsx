"use client";

import { useState, useSyncExternalStore } from "react";
import { DatabaseBackup, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  backupReminderText,
  downloadBackup,
  getBackupStatusSnapshot,
  isBackupReminderDue,
  snoozeBackupReminder,
  subscribeBackupStatus,
} from "@/lib/backup-client";

/**
 * Overdue-backup strip under the page header (managers only: associates get
 * 403 from /api/backup/status, so it never shows for them). Built on our
 * warning Alert; role="status" so screen readers announce it politely.
 * Shows any day once the last backup is 7+ days old; ✕ hides it until
 * tomorrow without pretending a backup happened.
 */
export function BackupBanner() {
  const status = useSyncExternalStore(subscribeBackupStatus, getBackupStatusSnapshot, () => null);
  const [loading, setLoading] = useState(false);
  if (!status || !isBackupReminderDue(status)) return null;

  async function handleBackup() {
    setLoading(true);
    try {
      await downloadBackup();
    } catch {
      // Cancelled save picker: leave the banner up.
    } finally {
      setLoading(false);
    }
  }

  return (
    <Alert
      variant="warning"
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-none border-x-0 border-t-0 px-4 py-2 [&>svg]:translate-y-0"
    >
      <DatabaseBackup aria-hidden />
      <p className="min-w-0 flex-1 basis-40 font-medium">{backupReminderText(status)}</p>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={handleBackup} disabled={loading}>
          <DatabaseBackup className="size-3.5" />
          {loading ? "Preparing…" : "Back up now"}
        </Button>
        <Button size="icon" variant="ghost" className="size-7" aria-label="Hide until tomorrow" onClick={() => void snoozeBackupReminder()}>
          <X className="size-4" />
        </Button>
      </div>
    </Alert>
  );
}
