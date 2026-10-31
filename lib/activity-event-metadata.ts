import type { ActivityEventType, OutreachMethod, OutreachOutcome } from "@/lib/db/schema";

export type ActivityEventMetadataMap = {
  created: Record<string, never>;
  edited: { fieldChanges?: Record<string, unknown> };
  outreach_logged: { method?: OutreachMethod; outcome?: OutreachOutcome };
  purchase: { method?: OutreachMethod; outcome?: OutreachOutcome; purchasedModel?: string };
  tag_added: { tagName?: string };
  tag_removed: { tagName?: string };
  transferred: { previousEmployeeName?: string; newEmployeeName?: string };
  promoted: Record<string, never>;
  note_added: { notePreview?: string };
  status_changed: { newStatus?: string };
  merged: { sourceClientId?: string; sourceClientName?: string };
  ban_requested: Record<string, never>;
  ban_approved: Record<string, never>;
  ban_rejected: Record<string, never>;
  unsub_requested: Record<string, never>;
  unsub_approved: Record<string, never>;
  unsub_rejected: Record<string, never>;
  delete_requested: Record<string, never>;
  delete_approved: Record<string, never>;
  delete_rejected: Record<string, never>;
};

export function getMetadata<T extends ActivityEventType>(
  eventType: T,
  metadata: Record<string, unknown> | null,
): ActivityEventMetadataMap[T] {
  return (metadata ?? {}) as ActivityEventMetadataMap[T];
}
