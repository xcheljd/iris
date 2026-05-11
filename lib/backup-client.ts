"use client";

const STORAGE_KEY = "iris_last_backup_at";

export function getLastBackupDate(): Date | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? new Date(stored) : null;
}

export function setLastBackupDate(): void {
  localStorage.setItem(STORAGE_KEY, new Date().toISOString());
}

export function shouldShowBackupReminder(): boolean {
  if (typeof window === "undefined") return false;
  const today = new Date();
  if (today.getDay() !== 1) return false; // Monday only

  const last = getLastBackupDate();
  if (!last) return true;

  const daysSince = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= 7;
}

// Replace this function body with Tauri's fs.writeBinaryFile + dialog.save() when wrapping in Tauri.
export async function downloadBackup(): Promise<void> {
  const res = await fetch("/api/backup/download");
  if (!res.ok) throw new Error("Backup download failed");

  const blob = await res.blob();
  const date = new Date().toISOString().split("T")[0];
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

  setLastBackupDate();
}
