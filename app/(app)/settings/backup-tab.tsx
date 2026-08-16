"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatabaseBackup, CheckCircle2, UploadCloud } from "lucide-react";
import { downloadBackup, getLastBackupDate } from "@/lib/backup-client";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { format } from "date-fns";

export function BackupTab() {
  const [loading, setLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState<Date | null>(null);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleRestore() {
    if (!restoreFile) return;
    setRestoring(true);
    try {
      const form = new FormData();
      form.append("file", restoreFile);
      const res = await fetch("/api/backup/restore", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Restore failed");
        setRestoring(false);
        return;
      }
      setRestored(true);
      setTimeout(() => window.location.reload(), 5000);
    } catch {
      toast.error("Restore failed — check your connection and try again");
      setRestoring(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackup className="size-5" />
            Database Backup
          </CardTitle>
          <CardDescription>
            Download a copy of the database to a safe location. Backups are recommended weekly.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {lastBackup && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-green-500" />
              Last backup: {format(lastBackup, "MMMM d, yyyy 'at' h:mm a")}
            </div>
          )}
          {!lastBackup && (
            <p className="text-sm text-amber-600">No backup recorded on this device.</p>
          )}
          <Button onClick={handleBackup} disabled={loading} className="gap-2">
            <DatabaseBackup className="size-4" />
            {loading ? "Preparing…" : "Download Backup"}
          </Button>
          <p className="text-xs text-muted-foreground">
            The backup is a copy of <code className="font-mono">iris.db</code> — the complete database file.
            Store it on an external drive or cloud storage.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="size-5" />
            Restore from Backup
          </CardTitle>
          <CardDescription>
            Replace the current database with a previously saved backup file. The server will restart automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {restored ? (
            <div className="rounded-md border border-green-500/50 bg-green-500/10 p-4 text-sm text-green-700 dark:text-green-400">
              <p className="font-medium">Restore complete.</p>
              <p className="text-green-700/90 dark:text-green-400/90">The server is restarting — this page will reload in a few seconds.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={restoring}
                >
                  Choose File
                </Button>
                {restoreFile ? (
                  <span className="text-sm text-muted-foreground">
                    {restoreFile.name} ({(restoreFile.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">No file selected</span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".db"
                  className="hidden"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <ConfirmDialog
                open={restoreOpen}
                onOpenChangeAction={setRestoreOpen}
                title="Restore database?"
                description={
                  <>
                    This will replace the current database with <strong>{restoreFile?.name}</strong>. All data added since
                    this backup was made will be lost. A <code>.bak</code> copy of the current database will be saved on
                    the server. This cannot be undone from within Iris.
                  </>
                }
                confirmLabel={restoring ? "Restoring…" : "Yes, Restore"}
                variant="destructive"
                disabled={restoring}
                onConfirmAction={handleRestore}
              />

              <Button
                variant="destructive"
                disabled={!restoreFile || restoring}
                onClick={() => setRestoreOpen(true)}
                className="gap-2"
              >
                <UploadCloud className="size-4" />
                Restore Database
              </Button>

              <p className="text-xs text-muted-foreground">
                Only <code className="font-mono">.db</code> files exported from this application are accepted.
                The server validates the file before replacing the database.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
