import { z } from "zod";
import { APPROVAL_REQUEST_TYPE_VALUES } from "@/lib/db/schema";

export const approvalRequestInputSchema = z.object({
  type: z.enum(APPROVAL_REQUEST_TYPE_VALUES, { error: () => "Invalid request type" }),
  clientId: z.uuid({ error: () => "Invalid client" }),
  reason: z.string().trim().min(1, "Reason is required").max(5000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ApprovalRequestInput = z.infer<typeof approvalRequestInputSchema>;
