"use client";

import { format, startOfTomorrow } from "date-fns";
import type { BackupStatus } from "@/lib/backup-status";

export type { BackupStatus };

// Client cache of /api/backup/status, shared by the banner and Settings ->
// Backup through useSyncExternalStore. Fetched once per page load and after
// every backup or snooze. null = not loaded yet, or not a manager (403).
let status: BackupStatus | null = null;
let started = false;
const listeners = new Set<() => void>();

export function subscribeBackupStatus(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!started) {
    started = true;
    void refreshBackupStatus();
  }
  return () => listeners.delete(onChange);
}

export function getBackupStatusSnapshot(): BackupStatus | null {
  return status;
}

function setStatus(next: BackupStatus | null) {
  status = next;
  listeners.forEach((l) => l());
}

export async function refreshBackupStatus(): Promise<void> {
  try {
    const res = await fetch("/api/backup/status");
    setStatus(res.ok ? ((await res.json()) as BackupStatus) : null);
  } catch {
    setStatus(null);
  }
}

async function post(payload: object): Promise<void> {
  const res = await fetch("/api/backup/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) setStatus((await res.json()) as BackupStatus);
}

/** Hide the reminder until local midnight; the last-backup date is untouched. */
export function snoozeBackupReminder(): Promise<void> {
  return post({ action: "snooze", until: startOfTomorrow().toISOString() });
}

export const BACKUP_DUE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days since the last backup, or null if none was ever recorded. */
export function daysSinceBackup(s: BackupStatus, now: Date = new Date()): number | null {
  return s.lastBackupAt ? Math.floor((now.getTime() - new Date(s.lastBackupAt).getTime()) / MS_PER_DAY) : null;
}

/** Due when there's no backup or it's 7+ days old, and the manager hasn't snoozed past now. */
export function isBackupReminderDue(s: BackupStatus | null, now: Date = new Date()): boolean {
  if (!s) return false;
  if (s.snoozedUntil && new Date(s.snoozedUntil) > now) return false;
  const days = daysSinceBackup(s, now);
  return days === null || days >= BACKUP_DUE_DAYS;
}

export function backupReminderText(s: BackupStatus, now: Date = new Date()): string {
  const days = daysSinceBackup(s, now);
  if (days === null) return "No backup yet.";
  // Non-breaking space keeps "9 days" together when the strip wraps on a phone.
  return `Last backup was ${days}\u00a0day${days === 1 ? "" : "s"} ago.`;
}

// Replace this function body with Tauri's fs.writeBinaryFile + dialog.save() when wrapping in Tauri.
export async function downloadBackup(): Promise<void> {
  const res = await fetch("/api/backup/download");
  if (!res.ok) throw new Error("Backup download failed");

  const blob = await res.blob();
  const date = format(new Date(), "yyyy-MM-dd");
  const filename = `iris-backup-${date}.db`;

  if ("showSaveFilePicker" in window) {
    const handle = await (window as Window & { showSaveFilePicker: (opts: object) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "SQLite Database", accept: { "application/x-sqlite3": [".db"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Recorded only after the file was written (a cancelled save picker throws above).
  await post({ action: "backed-up" });
}
