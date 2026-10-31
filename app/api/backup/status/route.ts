import { z } from "zod";
import { withManagerAuth } from "@/lib/api-helpers";
import { getBackupStatus, recordBackup, snoozeBackupReminder } from "@/lib/backup-status";

const MAX_SNOOZE_MS = 2 * 24 * 60 * 60 * 1000;

const body = z.discriminatedUnion("action", [
  // Sent by the browser after the backup file was saved.
  z.object({ action: z.literal("backed-up") }),
  // Hide the reminder until the given time (the browser's next local midnight).
  z.object({ action: z.literal("snooze"), until: z.iso.datetime({ offset: true }) }),
]);

export const GET = withManagerAuth(async (session) => Response.json(getBackupStatus(session.user.id)));

export const POST = withManagerAuth(async (session, req: Request) => {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (parsed.data.action === "backed-up") {
    recordBackup();
  } else {
    const until = new Date(parsed.data.until);
    const ms = until.getTime() - Date.now();
    if (ms <= 0 || ms > MAX_SNOOZE_MS) return Response.json({ error: "Snooze must end within two days" }, { status: 400 });
    snoozeBackupReminder(session.user.id, until);
  }
  return Response.json(getBackupStatus(session.user.id));
});
