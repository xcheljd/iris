import { describe, it, expect } from "vitest";
import { isBackupReminderDue, backupReminderText, daysSinceBackup } from "@/lib/backup-client";

const NOW = new Date(2026, 9, 14, 12, 0); // a Wednesday
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe("backup reminder", () => {
  it("is due on any day once the last backup is 7+ days old", () => {
    expect(isBackupReminderDue({ lastBackupAt: ago(7), snoozedUntil: null }, NOW)).toBe(true);
    expect(isBackupReminderDue({ lastBackupAt: ago(6.9), snoozedUntil: null }, NOW)).toBe(false);
  });

  it("is due when no backup was ever recorded", () => {
    expect(isBackupReminderDue({ lastBackupAt: null, snoozedUntil: null }, NOW)).toBe(true);
  });

  it("is hidden while snoozed and back once the snooze passes", () => {
    const tomorrow = new Date(2026, 9, 15).toISOString();
    expect(isBackupReminderDue({ lastBackupAt: ago(9), snoozedUntil: tomorrow }, NOW)).toBe(false);
    expect(isBackupReminderDue({ lastBackupAt: ago(9), snoozedUntil: tomorrow }, new Date(2026, 9, 15, 0, 1))).toBe(true);
  });

  it("never shows without a status (not loaded, or not a manager)", () => {
    expect(isBackupReminderDue(null, NOW)).toBe(false);
  });

  it("says the real age", () => {
    expect(daysSinceBackup({ lastBackupAt: ago(9.5), snoozedUntil: null }, NOW)).toBe(9);
    expect(backupReminderText({ lastBackupAt: ago(9.5), snoozedUntil: null }, NOW)).toBe("Last backup was 9\u00a0days ago.");
    expect(backupReminderText({ lastBackupAt: ago(1), snoozedUntil: null }, NOW)).toBe("Last backup was 1\u00a0day ago.");
    expect(backupReminderText({ lastBackupAt: null, snoozedUntil: null }, NOW)).toBe("No backup yet.");
  });
});
