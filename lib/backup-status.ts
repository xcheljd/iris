import { getMeta, setMeta } from "@/lib/db/meta";

// Backup reminder state lives in the database (meta table) so every device
// agrees: the store's last real backup, and each manager's own snooze.
// Snoozing never touches the last-backup date.

const LAST_BACKUP_KEY = "last_backup_at";
const snoozeKey = (userId: string) => `backup_snooze_until:${userId}`;

export interface BackupStatus {
  /** ISO time of the last completed backup download, or null if none recorded. */
  lastBackupAt: string | null;
  /** ISO time this manager's reminder is hidden until, or null. */
  snoozedUntil: string | null;
}

export function getBackupStatus(userId: string): BackupStatus {
  return { lastBackupAt: getMeta(LAST_BACKUP_KEY) ?? null, snoozedUntil: getMeta(snoozeKey(userId)) ?? null };
}

export function recordBackup(at: Date = new Date()): void {
  setMeta(LAST_BACKUP_KEY, at.toISOString());
}

export function snoozeBackupReminder(userId: string, until: Date): void {
  setMeta(snoozeKey(userId), until.toISOString());
}
