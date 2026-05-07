"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatabaseBackup, CheckCircle2 } from "lucide-react";
import { downloadBackup, getLastBackupDate } from "@/lib/backup-client";
import { toast } from "sonner";
import { format } from "date-fns";

export function BackupTab() {
  const [loading, setLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState<Date | null>(null);

  useEffect(() => {
    setLastBackup(getLastBackupDate());
  }, []);

  async function handleBackup() {
    setLoading(true);
    try {
      await downloadBackup();
      setLastBackup(getLastBackupDate());
      toast.success("Backup saved successfully");
    } catch {
      // User cancelled the file picker — no toast needed
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5" />
          Database Backup
        </CardTitle>
        <CardDescription>
          Download a copy of the database to a safe location. Backups are recommended weekly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastBackup && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Last backup: {format(lastBackup, "MMMM d, yyyy 'at' h:mm a")}
          </div>
        )}
        {!lastBackup && (
          <p className="text-sm text-amber-600">No backup recorded on this device.</p>
        )}
        <Button onClick={handleBackup} disabled={loading} className="gap-2">
          <DatabaseBackup className="h-4 w-4" />
          {loading ? "Preparing…" : "Download Backup"}
        </Button>
        <p className="text-xs text-muted-foreground">
          The backup is a copy of <code className="font-mono">iris.db</code> — the complete database file.
          Store it on an external drive or cloud storage. To restore, replace the database file with the backup.
        </p>
      </CardContent>
    </Card>
  );
}
