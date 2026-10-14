import { describe, it, expect } from "vitest";
import { isBackupReminderDue, backupReminderText, daysSinceBackup } from "@/lib/backup-client";

const NOW = new Date(2026, 9, 14, 12, 0); // a Wednesday
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const OLD = ago(400); // an install well past its grace week

describe("backup reminder", () => {
  it("is due on any day once the last backup is 7+ days old", () => {
    expect(isBackupReminderDue({ lastBackupAt: ago(7), snoozedUntil: null, installedAt: OLD }, NOW)).toBe(true);
    expect(isBackupReminderDue({ lastBackupAt: ago(6.9), snoozedUntil: null, installedAt: OLD }, NOW)).toBe(false);
  });

  it("is due when no backup was ever recorded", () => {
    expect(isBackupReminderDue({ lastBackupAt: null, snoozedUntil: null, installedAt: OLD }, NOW)).toBe(true);
  });

  it("is hidden while snoozed and back once the snooze passes", () => {
    const tomorrow = new Date(2026, 9, 15).toISOString();
    expect(isBackupReminderDue({ lastBackupAt: ago(9), snoozedUntil: tomorrow, installedAt: OLD }, NOW)).toBe(false);
    expect(isBackupReminderDue({ lastBackupAt: ago(9), snoozedUntil: tomorrow, installedAt: OLD }, new Date(2026, 9, 15, 0, 1))).toBe(true);
  });

  it("gives a fresh install with no backup a 7-day grace", () => {
    expect(isBackupReminderDue({ lastBackupAt: null, snoozedUntil: null, installedAt: ago(0) }, NOW)).toBe(false);
    expect(isBackupReminderDue({ lastBackupAt: null, snoozedUntil: null, installedAt: ago(6.9) }, NOW)).toBe(false);
    expect(isBackupReminderDue({ lastBackupAt: null, snoozedUntil: null, installedAt: ago(7) }, NOW)).toBe(true);
  });

  it("goes by the last backup once there is one, not the install date", () => {
    expect(isBackupReminderDue({ lastBackupAt: ago(8), snoozedUntil: null, installedAt: ago(1) }, NOW)).toBe(true);
  });

  it("never shows without a status (not loaded, or not a manager)", () => {
    expect(isBackupReminderDue(null, NOW)).toBe(false);
  });

  it("says the real age", () => {
    expect(daysSinceBackup({ lastBackupAt: ago(9.5), snoozedUntil: null, installedAt: OLD }, NOW)).toBe(9);
    expect(backupReminderText({ lastBackupAt: ago(9.5), snoozedUntil: null, installedAt: OLD }, NOW)).toBe("Last backup was 9\u00a0days ago.");
    expect(backupReminderText({ lastBackupAt: ago(1), snoozedUntil: null, installedAt: OLD }, NOW)).toBe("Last backup was 1\u00a0day ago.");
    expect(backupReminderText({ lastBackupAt: null, snoozedUntil: null, installedAt: OLD }, NOW)).toBe("No backup yet.");
  });
});
