import { min } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { getMeta, setMeta } from "@/lib/db/meta";

// Backup reminder state lives in the database (meta table) so every device
// agrees: the store's last real backup, and each manager's own snooze.
// Snoozing never touches the last-backup date.

const LAST_BACKUP_KEY = "last_backup_at";
const INSTALLED_KEY = "installed_at";
const snoozeKey = (userId: string) => `backup_snooze_until:${userId}`;

export interface BackupStatus {
  /** ISO time of the last completed backup download, or null if none recorded. */
  lastBackupAt: string | null;
  /** ISO time this manager's reminder is hidden until, or null. */
  snoozedUntil: string | null;
  /** ISO time the install started; a never-backed-up install gets 7 days' grace from here. */
  installedAt: string;
}

/**
 * When this install started, recorded once. An existing database dates from
 * its first employee (so installs that predate this field get no grace and
 * an overdue one still nags); a fresh one from now.
 */
function getInstalledAt(): string {
  const stored = getMeta(INSTALLED_KEY);
  if (stored) return stored;
  const first = db.select({ at: min(employees.createdAt) }).from(employees).get()?.at;
  const at = (first ? new Date(first) : new Date()).toISOString();
  setMeta(INSTALLED_KEY, at);
  return at;
}

export function getBackupStatus(userId: string): BackupStatus {
  return { lastBackupAt: getMeta(LAST_BACKUP_KEY) ?? null, snoozedUntil: getMeta(snoozeKey(userId)) ?? null, installedAt: getInstalledAt() };
}

export function recordBackup(at: Date = new Date()): void {
  setMeta(LAST_BACKUP_KEY, at.toISOString());
}

export function snoozeBackupReminder(userId: string, until: Date): void {
  setMeta(snoozeKey(userId), until.toISOString());
}
